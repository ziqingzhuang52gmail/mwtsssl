# 妖怪金手指 — 逆向工程 Code Wiki

> 项目完整代码结构文档，涵盖整体架构、模块职责、关键类与函数、依赖关系与运行方式。
> 
> 生成日期：2026-08-01

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [目录结构](#3-目录结构)
4. [游戏源代码模块](#4-游戏源代码模块)
5. [逆向工程工具链](#5-逆向工程工具链)
6. [核心类与函数](#6-核心类与函数)
7. [WebSocket 协议体系](#7-websocket-协议体系)
8. [HTTP API 接口](#8-http-api-接口)
9. [依赖关系](#9-依赖关系)
10. [项目运行方式](#10-项目运行方式)

---

## 1. 项目概述

| 项目 | 信息 |
|------|------|
| **游戏名称** | 妖怪金手指 (大蓝微信专服) |
| **游戏引擎** | Cocos Creator v2.4.15 |
| **客户端类型** | HTML5 Web 游戏 |
| **核心脚本** | `index.0f8ab.js` (约 24MB，单行压缩混淆) |
| **网络协议** | WebSocket + 自定义二进制协议 (Protobuf 编码) |
| **压缩算法** | QuickLZ |
| **SDK 平台** | 大蓝 SDK (`http://sdk.ygkksy.com:9000`) |
| **游戏 API** | `http://game.ygkksy.com:6162/sy_api/game_api.php` |
| **项目性质** | 基于开源游戏客户端源码的逆向工程与安全分析项目 |

### 项目目标

本仓库是一个**游戏逆向工程与安全研究项目**，主要目标包括：

1. **协议逆向**：分析 WebSocket 自定义协议结构，还原 Protobuf 消息格式
2. **安全审计**：发现游戏客户端与服务器通信中的安全漏洞（SSNV、IDOR、密钥泄露等）
3. **工具开发**：构建抓包、发包、协议探查、数据采集等辅助工具
4. **动态分析**：通过 Chrome DevTools 进行运行时 Hook 与代码注入

---

## 2. 整体架构

### 2.1 系统分层架构

```
┌──────────────────────────────────────────────────────────────┐
│                    浏览器 (Chrome)                            │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  SDK 登录页面 (sdk.ygkksy.com:9000)                     │  │
│  │  → 用户名/密码认证 → 获取 SDK Token                      │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           ↓                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  游戏入口页 (sdk.ygkksy.com:2222/index.php)              │  │
│  │  → 加载 h5SB_dalan.js (H5平台桥接)                       │  │
│  │  → 加载 index.0f8ab.js (游戏主逻辑)                      │  │
│  │  → 加载 cocos2d-js-min.a089a.js (引擎)                  │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           ↓                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Cocos Creator 游戏引擎层                               │  │
│  │  ├─ cc.js (类系统, 场景管理, 组件系统)                   │  │
│  │  ├─ Protobuf.js (消息序列化)                            │  │
│  │  └─ QuickLZ (数据压缩)                                  │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           ↓                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  游戏业务逻辑层                                         │  │
│  │  ├─ AgentMgr (登录/认证管理)                            │  │
│  │  ├─ SocketMgr (WebSocket通信)                           │  │
│  │  ├─ 115个业务模块 (Proxy)                               │  │
│  │  └─ UI系统 (UIMgr, GM面板等)                            │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           ↓                                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  逆向工程工具层 (本项目脚本)                             │  │
│  │  ├─ aq.js (一体化工坊:抓包+发包+探查)                    │  │
│  │  ├─ jb.txt (WebSocket协议日志Hook)                      │  │
│  │  ├─ crack_buildskin.js (破解脚本)                        │  │
│  │  ├─ forge_login.js (伪造登录)                           │  │
│  │  ├─ gm_force.js (GM面板强制激活)                        │  │
│  │  └─ collect_players.js (数据采集)                       │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
                           ↕ WebSocket / HTTP
┌──────────────────────────────────────────────────────────────┐
│                    游戏服务器端                               │
│  ├─ SDK 认证服务器 (sdk.ygkksy.com:9000)                     │
│  ├─ 游戏 API 服务器 (game.ygkksy.com:6162)                   │
│  ├─ LoginServer WebSocket (登录服)                           │
│  └─ GameServer WebSocket (游戏服)                            │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 登录流程（四层架构）

```
第一层: SDK网站登录
  POST /api/public/auth/member/login → SDK Token
  → 打开游戏入口页: /index.php?account=&token=

第二层: 游戏内PHP登录
  GET /sy_api/game_api.php?action=login → t_token + 服务器列表

第三层: LoginServer WebSocket
  → 获取 role 信息: {sessionkey, playerId, gameUrl}

第四层: GameServer WebSocket
  → LoginGame_LoginGame_C2S 协议包
  → 进入游戏主界面
```

### 2.3 数据流架构

```
C2S (客户端→服务端):
  业务数据 → Protobuf 编码 → 协议帧封装 → QuickLZ 压缩(可选) → WebSocket.send()

S2C (服务端→客户端):
  WebSocket.onmessage → 协议帧解析 → QuickLZ 解压(可选) → Protobuf 解码 → 业务处理
```

---

## 3. 目录结构

```
d:\Backup\Downloads\212\
│
├── 网页端源代码文件/          # ← 游戏客户端源码
│   ├── index.0f8ab.js         # 游戏主逻辑 (24MB压缩单行)
│   ├── cocos2d-js-min.a089a.js # Cocos Creator 引擎
│   ├── h5SB_dalan.js          # H5 SDK 平台桥接层
│   ├── content.js             # 浏览器扩展内容脚本
│   ├── 14466.js               # 代码分割 chunk
│   ├── 25709.js               # 代码分割 chunk
│   ├── 3166.js                # 代码分割 chunk
│   ├── 36463.js               # 代码分割 chunk
│   ├── 40480.js               # 代码分割 chunk
│   ├── 47024.js               # 代码分割 chunk
│   ├── 58499.js               # 代码分割 chunk
│   ├── 60953.js               # 代码分割 chunk
│   ├── 71151.js               # 代码分割 chunk
│   └── 99948.js               # 代码分割 chunk
│
├── 逆向工程工具脚本/           # ← 本项目核心产出
│   ├── aq.js                  # 一体化工具 (抓包+发包+探查)
│   ├── jb.txt                 # 协议日志 Hook 脚本
│   ├── jb_oneline.txt         # 单行版 Hook 脚本
│   ├── crack_buildskin.js     # 游戏破解脚本
│   ├── forge_login.js         # 账号伪造登录脚本
│   ├── gm_force.js            # GM面板强制激活脚本
│   ├── preinject.js           # 浏览器扩展预注入脚本
│   ├── send_helper.js         # 发包辅助工具
│   ├── collect_players.js     # 玩家数据采集工具
│   ├── collect_players_debug.js # 采集工具调试版
│   └── export_logs.js         # 日志导出工具
│
├── Python 签名工具/            # ← HTTP API sign 签名生成
│   ├── 版本1.py               # pay_goods_list (area=1)
│   ├── 版本2.py               # pay_goods_list (area=3)
│   └── 登录链接 (2).py        # login 签名生成
│
├── 分析报告与文档/             # ← 逆向分析成果
│   ├── 逆向工程完整手册.md     # 完整逆向工程手册 (核心文档)
│   ├── 核心逆向工程报告.md     # 签名与登录逆向报告
│   ├── 协议逆向分析报告.md     # WebSocket 协议逆向报告
│   ├── GM断线分析与绕过评估报告.md # GM系统断线分析
│   └── 金手指游戏_完整逆向分析与破解测试报告.md # 完整分析报告
│
├── 数据文件/
│   ├── 分析报告/               # 渗透参数分析数据
│   ├── 控制台日志              # 浏览器控制台日志
│   └── gm结果.txt              # GM命令执行结果
│
└── Code_Wiki.md               # ← 本文档
```

---

## 4. 游戏源代码模块

### 4.1 index.0f8ab.js — 主游戏逻辑

**文件描述**：游戏的核心 JavaScript 文件，约 24MB，单行压缩混淆。包含所有业务逻辑、网络通信层、Protobuf 协议定义和 UI 组件。

**代码分割**：`14466.js` ~ `99948.js` 等 10 个文件是 Webpack/Rspack 代码分割产生的 chunk 文件，按需加载。

**关键源码位置索引**（字符偏移量）：

| 功能 | 位置 | 描述 |
|------|------|------|
| `_tryOpenGMButton` | 16953157 | GM按钮条件判断 |
| `_shouldLoadGMBundle` | 附近 | GM Bundle 加载判断 |
| `ensureGmBundleAndScripts` | 18310450 | GM模块加载器 |
| `MakeTestOperRequest` | 22831805 | GM命令发送 (`this._s.send(this._m, 174, e, t)`) |
| `calSign` | 搜索 `507310f58a0ac8e3d8ad8f60c8b85b46` | 签名密钥硬编码位置 |
| `onCloseHandler` | 20566494 | WebSocket关闭处理 |
| `socketConnectGameErrorHandler` | 6027443 | 游戏Socket断线处理 |
| `loginGameServerSuccess` | 6027900 | LoginGame_C2S协议构建 |
| Protocol log 断点 | 20568696 | `this.log(" 收到 " + ...)` |

### 4.2 cocos2d-js-min.a089a.js — 游戏引擎

**文件描述**：Cocos Creator v2.4.15 引擎的压缩版本。提供：

- `cc` 全局对象：引擎入口
- `cc.js.getClassByName(className)`：通过类名获取 Cocos 类
- `cc.Class`：类定义系统
- 场景管理、组件系统、资源加载、UI 渲染等底层能力

### 4.3 h5SB_dalan.js — H5 平台桥接层

**文件描述**：大蓝 SDK 的 H5 平台适配层，在游戏引擎和 SDK 之间建立桥梁。

**核心类：`H5Platform`**

| 方法 | 功能 |
|------|------|
| `init()` | 平台初始化，加载 SDK，解析 URL 参数 |
| `login(cb)` | 发起 SDK 登录（或使用 PHP 参数直接登录） |
| `loginOut()` | 登出并切换账号 |
| `purchase(params, cb)` | 发起支付流程 |
| `gameReport(params)` | 上报游戏数据（选服、创角、升级等） |
| `cmd(params, cb)` | 处理引擎发来的命令（LoginRsp、SwitchServer、SetDebugModel 等） |
| `showAds(params, cb)` | 展示广告（激励视频） |
| `_getPhpLoginData()` | 从 URL 参数中提取 PHP 登录凭证 |
| `_copyToClipBoard(text, cb)` | 复制到剪贴板 |
| `_showToast(title, duration)` | 显示轻提示 |

**全局实例**：`window._h5_platform = new H5Platform()`

### 4.4 content.js — 浏览器扩展内容脚本

**文件描述**：浏览器扩展（如 AI 助手类扩展）注入到游戏页面的内容脚本。主要负责：

- 页面内容提取（HTML → Markdown 转换）
- 与扩展 Background Script 通信
- 页面加载状态管理

**关键类**：

| 类名 | 功能 |
|------|------|
| `y` (HTMLToMarkdownConverter) | 将 DOM 节点递归转换为 Markdown 文本 |
| `w` (MessageHandler) | 处理扩展消息，注册/注销事件处理器 |
| 全局函数 | `readPageBeforeCompleteRequestHandler` 等 |

---

## 5. 逆向工程工具链

### 5.1 aq.js — 阿庆一体化工具

**版本**：v1.0  
**功能分类**：抓包 + 发包 + 协议探查

**核心函数**：

| 函数名 | 类型 | 功能 |
|--------|------|------|
| `window.go(mod, cmd, data)` | 发包 | 最简洁的发包方式 |
| `window.send(mod, cmd, data)` | 发包 | go() 的别名 |
| `window.sendByName(modName, cmdName, data)` | 发包 | 按模块名/命令名发包 |
| `window.listModules()` | 探查 | 列出所有业务模块 |
| `window.listCommands(modId)` | 探查 | 列出指定模块的所有命令 |
| `window.inspectProto(modId, cmdId)` | 探查 | 查看协议字段定义 |
| `window._aq_objToStr(obj)` | 工具 | 将 Protobuf 对象序列化为 JSON |
| `window._aq_protocol_log` | 数据 | 协议记录数组 |

**Hook 机制**：

- 自动 Hook `SocketMgr.prototype.send` (C2S 抓包)
- 自动 Hook `SocketMgr.prototype.parserS2C` (S2C 抓包)
- 自动 Hook `SocketMgr.prototype.log` (静默捕获日志)
- 自动 Hook `GameRoomSocket` 同名方法

**内部实现**：

```
_hook(className) → 遍历 Hook send/parserS2C/log 三个方法
_restore(className) → 恢复原始方法（避免重复 Hook）
_getSM() → 通过 cc.js.getClassByName('SocketMgr') 获取实例
_getGR() → 通过 cc.js.getClassByName('GameRoomSocket') 获取实例
```

### 5.2 jb.txt — 阿庆协议抓包

**版本**：v4.2  
**功能**：WebSocket 协议日志 Hook，将 Protobuf 二进制协议解码为可读 JSON 明文

**核心函数**：

| 函数 | 功能 |
|------|------|
| `_aqOut(dir, label, json)` | 格式化输出（🚀C2S / 📥S2C） |
| `objToStr(obj, depth, visited)` | 递归对象序列化（支持循环引用、Long、Binary） |
| `_hook(sm)` | 获取 SocketMgr 实例并 Hook |
| `_restore()` | 恢复原始方法 |

**使用方式**：

1. 在 `index.0f8ab.js` 第 1 行第 20568696 列设置断点
2. 在 Console 中执行 `jb.txt` 内容
3. 协议日志输出到 Console 并存储在 `window._aq_protocol_log`

### 5.3 crack_buildskin.js — 阿庆破解脚本

**版本**：v1.0  
**功能**：游戏客户端漏洞利用脚本

**核心函数**：

| 函数 | 功能 | 协议 | 漏洞类型 |
|------|------|------|----------|
| `unlockBuildSkin(skinId)` | 解锁建筑皮肤 | Mod 91 Cmd 7 SkinUp | SSNV (服务端无验证) |
| `unlockAllBuildSkins()` | 批量解锁所有皮肤 (1~1000) | Mod 91 Cmd 7 | SSNV |
| `changeName(newName)` | 免费改名 | Mod 13 Cmd 6 ChangeName | 首次免费 |
| `changeNameByCost(newName)` | 付费改名(可能免费) | Mod 13 Cmd 20 ChangeNameByCost | SSNV 风险 |
| `send(mod, cmd, data)` | 通用发包 | 任意 | — |
| `listModules()` | 列出所有模块 | — | — |
| `listCommands(moduleId)` | 列出模块命令 | — | — |

**Hook 劫持**：

| Hook 目标 | 效果 |
|-----------|------|
| `BagModule.getItemNumByID` | 始终返回 9999，绕过客户端资源检查 |
| `EntityDataParser.handleClientRewardAndCost` | 拦截扣费逻辑，阻止客户端资源扣除 |

### 5.4 forge_login.js — 账号伪造登录

**版本**：v1.0  
**功能**：利用泄露的 secret_key 伪造任意账号登录

**核心函数**：

| 函数 | 功能 |
|------|------|
| `forgePhpLogin()` | 伪造 PHP 登录，获取 t_token |
| `hijackAgentMgr(phpResult)` | 劫持 AgentMgr 内部状态 |
| `triggerGameConnect()` | 触发游戏服务器连接 |
| `verifyLogin()` | 验证当前登录状态 |

**配置变量**：

```javascript
TARGET_ACCOUNT = "目标手机号"    // 任意手机号均可伪造
TARGET_SERVER = { s_id, s_name, area, port }
SECRET_KEY = "507310f58a0ac8e3d8ad8f60c8b85b46td"
```

### 5.5 gm_force.js — GM 面板强制激活

**版本**：v2.1  
**功能**：绕过客户端 GM 条件检查，强制打开 GM 面板

**执行步骤**：

1. **Step 1**：修改 `AgentConfig._localAgent.AgentCode` 为 `"test"`
2. **Step 2**：修改 `_checkConfig` 和 `_remoteAgent.checkConfig` 中的 GM 开关
3. **Step 3**：Hook `SDKMgr.getPerformConfig` 使 OpenGM 返回 1
4. **Step 4**：通过 `UIMgr.Ins.open(GMView, 10)` 直接打开 GM 面板

**注意**：GM 面板可打开查看，但执行 GM 命令会被服务端踢出（服务端 GM 权限校验）。

### 5.6 send_helper.js — 发包辅助工具

**版本**：v1.0  
**功能**：配合 `jb.txt` 使用，提供协议校验增强版的发包功能

**核心函数**：

| 函数 | 功能 |
|------|------|
| `send(moduleId, cmdId, data)` | 带协议校验的发包 |
| `sendByName(moduleName, cmdName, data)` | 按名称发包 |
| `listModules()` | 列出所有模块 |
| `listCommands(moduleId)` | 列出模块命令 |
| `inspectProto(moduleId, cmdId)` | 查看协议字段定义 |

### 5.7 collect_players.js — 玩家数据采集

**版本**：v1.0  
**功能**：自动采集符合条件的玩家数据（战斗力 = 1000000）

**方案 A**：基于 `aq.js` 的日志监听（需先执行 aq.js）
**方案 B**：直接 Hook `SocketMgr.parserS2C` 拦截协议

**目标协议**：`PlayerInfoProxy.GetBasePlayerInfosR` (Mod 13, Cmd 32)

**核心函数**：

| 函数 | 功能 |
|------|------|
| `hookSocketMgrForCollection()` | 方案B：Hook SocketMgr |
| `showCollectedData()` | 显示采集结果 |
| `copyCollectedData()` | 复制数据到剪贴板 |
| `clearCollectedData()` | 清空采集数据 |

### 5.8 Python 签名工具

**通用逻辑**：

```python
secret_key = "507310f58a0ac8e3d8ad8f60c8b85b46td"

def generate_sign(params):
    sorted_keys = sorted(params.keys())
    param_str = "&".join([f"{key}={params[key]}" for key in sorted_keys])
    sign_string = param_str + secret_key
    return hashlib.md5(sign_string.encode('utf-8')).hexdigest().lower()
```

| 文件 | 接口 | 参数差异 |
|------|------|----------|
| `版本1.py` | pay_goods_list | area=1, server_id=1 |
| `版本2.py` | pay_goods_list | area=3, server_id=3 |
| `登录链接 (2).py` | login | 含 username/password/game_uin |

---

## 6. 核心类与函数

### 6.1 Cocos Creator 引擎类

| 类名 | 实例获取 | 关键属性/方法 | 作用 |
|------|---------|--------------|------|
| `AgentMgr` | `cc.js.getClassByName('AgentMgr').Ins` | `_phpUuid`, `_sdkUuid`, `tryLoginAccount`, `_tokenFromPhp`, `_selectServer`, `loginR`, `_loginKey`, `_loginStatus`, `calSign()`, `connectGameServer()`, `doLogin()` | 登录/认证管理 |
| `AgentConfig` | `cc.js.getClassByName('AgentConfig').Ins` | `_localAgent`, `_remoteAgent`, `_checkConfig` | 运行时配置 |
| `SocketMgr` | `cc.js.getClassByName('SocketMgr').Ins` | `_address`, `_socket`, `_moduleDic`, `_cmdDic`, `_responseDic`, `send(mod,cmd,data)`, `parserS2C()`, `onMessageHandler()`, `onCloseHandler()`, `getModuleName()`, `getCmdName()` | 主游戏 Socket 管理 |
| `GameRoomSocket` | `cc.js.getClassByName('GameRoomSocket').Ins` | 同 SocketMgr | 副本/房间 Socket 管理 |
| `UIMgr` | `cc.js.getClassByName('UIMgr').Ins` | `open(view, layerType)` | UI 面板管理 |
| `SDKMgr` | `cc.js.getClassByName('SDKMgr').Ins` | `performConfig`, `getPerformConfig(key, defaultVal)` | 性能/功能配置管理 |
| `TestProxy` | `cc.js.getClassByName('TestProxy').Ins` | `MakeTestOperRequest(e, t)` | GM 命令代理 |
| `LoginMgr` | `cc.js.getClassByName('LoginMgr').Ins` | `loginStageType` | 登录状态管理 |
| `HttpMgr` | `cc.js.getClassByName('HttpMgr')` | `isHttps()` | HTTP 工具 |
| `ReconnectMgr` | `cc.js.getClassByName('ReconnectMgr').Ins` | 重连参数 | 断线重连管理 |
| `BagModule` | `cc.js.getClassByName('BagModule').Ins` | `getItemNumByID(code)` | 背包模块 |
| `EntityDataParser` | `cc.js.getClassByName('EntityDataParser').Ins` | `handleClientRewardAndCost(campId, cost, isShow)` | 客户端资源消耗处理 |
| `OptionalModuleLoader` | — | `ensureGmBundleAndScripts()` | GM 模块加载器 |
| `GMView` | `cc.js.getClassByName('GMView')` | — | GM 面板 UI 类 |

### 6.2 全局对象

| 对象 | 来源 | 说明 |
|------|------|------|
| `cc` | cocos2d-js-min.a089a.js | Cocos Creator 引擎入口 |
| `cc.js.getClassByName(name)` | 引擎 | 通过类名获取 Cocos 类 |
| `window.__GM_BRIDGE__` | index.0f8ab.js | GM 桥接对象（含 AgentConfig、SDKMgr、UIMgr 等） |
| `QuickLZ` | index.0f8ab.js | 数据压缩/解压库 |
| `BufferUtils` | index.0f8ab.js | Protobuf 编码/解码工具 |
| `_` (lodash) | index.0f8ab.js | 工具函数库 |
| `_hm` (window._hm) | wdSdk.min.js | 大蓝 SDK 实例 |

### 6.3 关键枚举

| 枚举 | 值 | 含义 |
|------|-----|------|
| `PerformType.LogOpen` | 1000 | 日志开关 |
| `PerformType.OpenGM` | 20020 | GM 开关 |
| `PerformType.DebugOpen` | 30002 | 调试开关 |
| `PerformType.AddResQuickly` | 待查 | 快速添加资源 |
| `UILayerType.GM` | 10 或 11 | GM 面板层级 |
| `SocketStatusType.Error` | — | WebSocket 错误状态 |
| `AgentEventType.LoginGameError` | — | 登录游戏错误事件 |
| `LoginStageType.CollectGameSocketErr` | — | Socket 错误状态 |

### 6.4 关键函数调用链

**登录流程**：

```
doLogin(account)
  → 构建 login 参数 + calSign()
  → HTTP GET game_api.php?action=login
  → loginHandler() → 设置 _phpUuid, _tokenFromPhp, selectServer
  → 触发 AgentEventType.LoginPhpSuccess

connectGameServer()
  → SocketMgr.init(ws:// + loginR.role.gameUrl)
  → SocketMgr.connect()
  → socketConnectGameHandler() → loginGameServerSuccess()
  → LoginGameProxy.LoginGameRequest(LoginGame_C2S)
  → loginGameSuccessHandler() → 进入游戏
```

**GM 命令执行**：

```
TestProxy.MakeTestOperRequest(MakeTestOper_Test_C2S, callback)
  → SocketMgr.send(Test_ModuleID, 174, C2S_Data, callback)
  → 服务端校验 GM 权限
  → 非 GM 账号 → WebSocket.close() (code=1005)
  → onCloseHandler → SocketEventType.Close
  → socketConnectGameErrorHandler → LoginGameError
  → ReconnectMgr 自动重连 → 退回登录界面
```

**WebSocket 数据流**：

```
服务端 → WebSocket.onmessage
  → SocketMgr.onMessageHandler
  → SocketMgr.onMessageParser (解压缩 + 协议头解析)
  → SocketMgr.parserS2C (Protobuf 解码)
  → SocketMgr.log (日志 + 业务回调)
  → 各 Proxy 处理响应
```

### 6.5 AgentConfig 配置结构

**`_localAgent` 完整字段**：

```json
{
    "AgentCode": "wechat",
    "skipSdk": "1",
    "DataBinPath": "config_all/weixin",
    "__KEY": "h5_ht",
    "clientType": "1",
    "h5SBFileName": "h5SB_dalan.js",
    "indexHtmlFile": "indexRelease.html",
    "useThirdSystem": "1",
    "HttpSerever": "game.ygkksy.com:6162/sy_api/game_api.php",
    "Project": "td",
    "PtId": "1",
    "ServerName": "大蓝微信专服",
    "DistTime": "20260615 23:00:50",
    "ClientVer": "129091",
    "ConfigVer": "128977",
    "BuildTime": "20260615 16:57:53"
}
```

**`_remoteAgent` 完整字段**：

```json
{
    "http_server": "http://game.ygkksy.com:6162/sy_api/game_api.php",
    "http_server_shenhe": "http://game.ygkksy.com:6162/sy_api/game_api.php",
    "res_host": "",
    "checkConfig": "[\"LogOpen:0\",\"DebugOpen:0\",\"_OpenGM:0\",\"CloseAutoLogin:1\",\"isAdvertise:1\"]",
    "cver": "999999",
    "configVer": "weixin84847",
    "version": "online"
}
```

---

## 7. WebSocket 协议体系

### 7.1 协议帧结构

**S2C (Server → Client)**：

| 字段 | 偏移 | 长度 | 说明 |
|------|------|------|------|
| Size | 0 | 2+ | 数据包总长度（变长编码） |
| SSID | 2+ | 1+ | 会话ID（变长编码） |
| Module | 3+ | 1+ | 模块ID（变长编码） |
| Cmd | 4+ | 1+ | 命令ID（变长编码） |
| IsCompress | 5+ | 1 | 压缩标志 (0/1) |
| Body | 6+ | 变长 | 协议体（可能经 QuickLZ 压缩，然后 Protobuf 编码） |

### 7.2 业务模块列表（共 115 个）

| ID | 模块名 | 功能 | 命令数 |
|:--:|--------|------|:-----:|
| 1 | LoginProxy | 登录 | 3 |
| 2 | LoginGameProxy | 游戏登录/心跳 | 19 |
| 3 | TreasureChestProxy | 宝箱 | 6 |
| 4 | HangUpFightProxy | 挂机战斗 | 7 |
| 5 | TestProxy | 测试/GM工具 | 42 |
| 6 | BagProxy | 背包 | 25 |
| 7 | MailProxy | 邮件 | 8 |
| 8 | EquipProxy | 装备 | 12 |
| 9 | SummonerProxy | 召唤 | 12 |
| 10 | BattleProxy | 战斗 | 17 |
| 11 | AdventureProxy | 冒险 | 17 |
| 12 | RankingProxy | 排行榜 | 6 |
| 13 | PlayerInfoProxy | 玩家信息 | 21 |
| 14 | UnlockProxy | 解锁 | 5 |
| 15 | FriendProxy | 好友 | 16 |
| 16 | ShopProxy | 商城 | 9 |
| 17 | TaskProxy | 任务 | 12 |
| 18 | ActivityProxy | 活动 | 17 |
| 19 | ChatProxy | 聊天 | 10 |
| 20 | AdvertiseProxy | 广告 | 4 |
| 22 | GuidanceProxy | 引导 | 6 |
| 23 | HeroProxy | 英雄 | 23 |
| 24 | HandBookProxy | 图鉴 | 20 |
| 25 | FormationProxy | 阵型 | 14 |
| 26 | SearchSummonProxy | 搜索召唤 | 8 |
| 27 | DailyFubenProxy | 日常副本 | 10 |
| 28 | SmithyProxy | 铁匠铺 | 12 |
| 29 | GameDefProxy | 游戏定义 | 2 |
| 30 | ClimbTowerProxy | 爬塔 | 10 |
| 31 | ArenaProxy | 竞技场 | 14 |
| 32 | ArtifactProxy | 神器 | 10 |
| 33 | RelicProxy | 遗迹 | 9 |
| 34 | IndividualityProxy | 个性 | 12 |
| 35 | TeamExpeditionProxy | 组队远征 | 10 |
| 36 | GuildProxy | 公会 | 18 |
| 37 | FeedingHandbookProxy | 喂养手册 | 8 |
| 38 | VipProxy | VIP | 4 |
| 39 | RechargeProxy | 充值 | 6 |
| 41 | BeautyBagProxy | 美容包 | 6 |
| 42 | DojoProxy | 道场 | 10 |
| 43 | StarAtlasProxy | 星图 | 16 |
| 44 | EightDiagramProxy | 八卦 | 7 |
| 45 | RacialTowerProxy | 种族塔 | 8 |
| 46 | OrganProxy | 机关 | 14 |
| 47 | ChampionshipProxy | 锦标赛 | 14 |
| 48 | MagicAnimalProxy | 灵兽 | 16 |
| 49 | ThemeSummonProxy | 主题召唤 | 10 |
| 50 | InfoPushProxy | 信息推送 | 9 |
| 51 | TitleProxy | 称号 | 10 |
| 52 | DermaProxy | 皮肤 | 8 |
| 53 | FarmTransportProxy | 农场运输 | 10 |
| 55 | WorldChampionshipsProxy | 世界锦标赛 | 8 |
| 56 | RoyalVaultProxy | 皇家宝库 | 8 |
| 57 | CycleGameProxy | 循环游戏 | 8 |
| 58 | GuildActivityBossProxy | 公会活动Boss | 10 |
| 59 | GuildBathActivityProxy | 公会浴场 | 8 |
| 60 | NewWorldChampionshipsProxy | 新世界锦标赛 | 10 |
| 61 | GuildNavalWarProxy | 公会海战 | 16 |
| 62 | GuildFortressProxy | 公会要塞 | 10 |
| 63 | GuildChallengeProxy | 公会挑战 | 10 |
| 64 | ThreeTeamExpeditionProxy | 三队远征 | 8 |
| 65 | HeartVesselProxy | 心器 | 8 |
| 66 | CompareProxy | 对比 | 2 |
| 67 | WorldRedBagProxy | 世界红包 | 8 |
| 68 | CaptiveProxy | 俘虏 | 8 |
| 69 | TelepathizeTreeProxy | 通感树 | 8 |
| 70 | ModulePreviewProxy | 模块预览 | 4 |
| 71 | RedBagProxy | 红包 | 8 |
| 72 | MiningProxy | 挖矿 | 12 |
| 73 | NightmareTowerProxy | 噩梦塔 | 10 |
| 74 | MultiHandBookProxy | 多图鉴 | 8 |
| 75 | DynastyWarriorsProxy | 无双 | 10 |
| 77 | CityTreasureProxy | 城宝 | 8 |
| 78 | GhoulProxy | 僵尸 | 10 |
| 79 | AbyssTowerProxy | 深渊塔 | 10 |
| 81 | MiniGameProxy | 小游戏 | 8 |
| 82 | BuildProxy | 建筑 | 14 |
| 83 | NewAdventureProxy | 新冒险 | 8 |
| 84 | PassRankProxy | 通行证 | 12 |
| 85 | TrainingRoomProxy | 训练室 | 8 |
| 86 | GuildContributionProxy | 公会贡献 | 4 |
| 87 | GuildCutProxy | 公会分成 | 4 |
| 88 | WorldBossProxy | 世界Boss | 8 |
| 89 | GuildCoBossProxy | 公会合作Boss | 8 |
| 91 | BuildSkinProxy | 建筑皮肤 | 8 |
| 92 | PassShowProxy | 通行证展示 | 4 |
| 93 | BuildWorldProxy | 建筑世界 | 8 |
| 94 | WerewolfProxy | 狼人 | 10 |
| 95 | RankingWorldProxy | 世界排行榜 | 4 |
| 96 | DemonDreamProxy | 恶魔梦境 | 8 |
| 97 | ReportedProxy | 举报 | 4 |
| 98 | GuildNavalWarMatchProxy | 公会海战匹配 | 4 |
| 99 | WorldBossMonthlyProxy | 世界Boss月度 | 6 |
| 100 | SingleExpeditionProxy | 单人远征 | 6 |
| 101 | GuessProxy | 猜谜 | 6 |
| 102 | SingleExpeditionMonthlyProxy | 单人远征月度 | 6 |
| 103 | GhostWarProxy | 鬼战 | 6 |
| 104 | SummonCreatureProxy | 召唤生物 | 6 |
| 105 | DaoistProxy | 道士 | 6 |
| 106 | TeamExpedition16Proxy | 16人组队远征 | 6 |
| 107 | DemonDream392Proxy | 恶魔梦境392 | 6 |
| 108 | MountProxy | 坐骑 | 6 |
| 109 | DemonDream408Proxy | 恶魔梦境408 | 6 |
| 110 | SuitProxy | 套装 | 6 |
| 111 | CampGVGProxy | 阵营GVG | 6 |
| 112 | AntiqueProxy | 古董 | 6 |
| 113 | AnnivCelebrateMarketProxy | 周年庆市场 | 6 |
| 114 | AnnivCelebrateAttachFeastProxy | 周年庆附属盛宴 | 6 |
| 115 | CommonRedBagProxy | 通用红包 | 6 |
| 116 | TeamDungeonProxy | 组队副本 | 6 |

### 7.3 关键协议详情

**Mod 13 - PlayerInfoProxy**：

| Cmd | 名称 | 方向 | 说明 |
|:---:|------|:----:|------|
| 1 | GetPlayerMoney | C2S | 获取玩家货币 |
| 2 | GetPlayerMoneyR | S2C | 货币数据响应 |
| 6 | ChangeName | C2S | 免费改名 |
| 10 | ChangeNameByCost | C2S | 付费改名 |
| 18 | SearchPlayer | C2S | 搜索玩家 |
| 32 | GetBasePlayerInfosR | S2C | 玩家基础信息响应 |

**Mod 91 - BuildSkinProxy**：

| Cmd | 名称 | 方向 | 说明 |
|:---:|------|:----:|------|
| 1 | SkinItem | C2S | 获取皮肤列表 |
| 7 | SkinUp | C2S | 解锁/升级皮肤 (**SSNV漏洞**) |
| 8 | SkinUpR | S2C | 解锁响应 |

**Mod 5 - TestProxy (GM命令)**：

| Cmd | 名称 | 方向 | 说明 |
|:---:|------|:----:|------|
| 174 | MakeTestOper | C2S | GM命令执行 (**服务端校验**) |

### 7.4 Protobuf 协议示例

**SkinUp (Mod 91, Cmd 7)**：

| 字段索引 | 名称 | Wire类型 | 说明 |
|:-------:|------|:--------:|------|
| 1 | skinId | fixed64 | 皮肤ID |

**SkinUpR (Mod 91, Cmd 8)**：

| 字段索引 | 名称 | Wire类型 | 说明 |
|:-------:|------|:--------:|------|
| 1 | err | fixed64 | 错误码 |
| 2 | skinItem | fixed64 | 皮肤数据 |
| 3 | clientCost | fixed64 | 客户端消耗 |
| 4 | goldShow | len-delimited | 金币展示 |
| 5 | equipSkills | len-delimited | 装备技能 |

---

## 8. HTTP API 接口

### 8.1 接口清单

| action | 接口 | 用途 |
|--------|------|------|
| login | `GET /sy_api/game_api.php` | 游戏内PHP登录 |
| pay_goods_list | `GET /sy_api/game_api.php` | 获取支付商品列表 |
| game_notice | `GET /sy_api/game_api.php` | 获取游戏公告 |
| get_AllServerList | `GET /sy_api/game_api.php` | 获取服务器列表 |
| get_versionInfoApi | `GET /sy_api/game_api.php` | 获取版本信息 |

### 8.2 Sign 签名算法

```
1. 所有参数按 key 字母升序排列
2. 拼接为 param1=value1&param2=value2&...
3. 末尾拼接 secret_key
4. MD5 哈希 → 全小写十六进制
```

**密钥**：`secret_key = 507310f58a0ac8e3d8ad8f60c8b85b46td`

**特殊规则**：

- `ext` 参数：sign 计算时使用 URL 解码后的 JSON 明文
- 空值参数正常参与排序和拼接
- `time` 参数：毫秒级时间戳，服务端不做过期校验

### 8.3 已发现的安全漏洞

| 漏洞类型 | 影响范围 | 严重程度 |
|----------|---------|:--------:|
| secret_key 硬编码泄露 | 所有 HTTP API | 高危 |
| skipSdk 绕过 SDK 认证 | login 接口 | 高危 |
| IDOR 任意账号登录 | login 接口 | 高危 |
| WebSocket 无握手认证 | 游戏通信 | 高危 |
| BuildSkin SSNV (服务端无验证) | Mod 91 Cmd 7 | 中危 |
| playerId 越权查询 | pay_goods_list | 高危 |
| time 无过期校验 | 所有接口 | 中危 |

---

## 9. 依赖关系

### 9.1 外部依赖

| 依赖 | 用途 | 加载方式 |
|------|------|----------|
| Cocos Creator v2.4.15 | 游戏引擎 | 本地 `cocos2d-js-min.a089a.js` |
| Protobuf.js | 消息序列化 | 内嵌在 `index.0f8ab.js` 中 |
| QuickLZ | 数据压缩 | 内嵌在 `index.0f8ab.js` 中 |
| lodash (`_`) | 工具函数库 | 内嵌在 `index.0f8ab.js` 中 |
| CryptoJS | MD5 哈希 | 浏览器环境或 Node.js |
| 大蓝 SDK (`wdSdk.min.js`) | 平台 SDK | 动态加载 |
| Chrome DevTools | 调试工具 | 浏览器内置 |

### 9.2 脚本间依赖关系

```
aq.js (一体化工具)
├── 独立运行，不依赖其他脚本
├── 依赖 cc.js.getClassByName('SocketMgr')
├── 依赖 cc.js.getClassByName('GameRoomSocket')
└── 提供: window._aq_protocol_log, window._aq_objToStr

jb.txt (协议抓包)
├── 独立运行（需先在 index.0f8ab.js 设断点）
├── 依赖 cc.js.getClassByName('SocketMgr')
└── 提供: window._aq_protocol_log

crack_buildskin.js (破解脚本)
├── 独立运行
├── 依赖 cc.js.getClassByName('SocketMgr')
├── 依赖 cc.js.getClassByName('BagModule')
└── 依赖 cc.js.getClassByName('EntityDataParser')

forge_login.js (伪造登录)
├── 独立运行
├── 依赖 cc.js.getClassByName('AgentMgr')
├── 依赖 cc.js.getClassByName('SocketMgr')
└── 依赖 CryptoJS (MD5)

gm_force.js (GM激活)
├── 独立运行
├── 依赖 cc.js.getClassByName('AgentConfig')
├── 依赖 cc.js.getClassByName('SDKMgr')
└── 依赖 cc.js.getClassByName('UIMgr')

send_helper.js (发包辅助)
├── 独立运行
├── 依赖 cc.js.getClassByName('SocketMgr')
└── 可配合 jb.txt 使用

collect_players.js (数据采集)
├── 方案A: 依赖 aq.js (先执行 aq.js)
├── 方案B: 独立运行 (Hook SocketMgr)
└── 依赖 cc.js.getClassByName('SocketMgr')

Python 脚本
├── 独立运行
├── 依赖 Python 3.x + hashlib
└── 不依赖浏览器环境
```

### 9.3 项目依赖图

```
                    ┌──────────────────┐
                    │  Cocos Creator   │
                    │   v2.4.15        │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ↓              ↓              ↓
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │Protobuf.js│  │ QuickLZ  │  │  lodash  │
        └──────────┘  └──────────┘  └──────────┘
              │              │              │
              └──────────────┼──────────────┘
                             ↓
                    ┌──────────────────┐
                    │  index.0f8ab.js  │
                    │  (游戏主逻辑)     │
                    └────────┬─────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ↓                   ↓                   ↓
   ┌──────────┐      ┌──────────────┐    ┌──────────────┐
   │h5SB_dalan│      │  content.js  │    │ 代码分割chunk │
   │  .js     │      │  (扩展注入)   │    │ (10个文件)   │
   └──────────┘      └──────────────┘    └──────────────┘
         ↑
         │ (动态加载)
   ┌──────────┐
   │wdSdk.min │
   │   .js    │
   └──────────┘

═══════════════════════════════════════════════════════
  以上为游戏原始代码 | 以下为本项目逆向工程工具
═══════════════════════════════════════════════════════

   ┌──────────────────────────────────────────────────┐
   │                  aq.js (一体化工具)                │
   │  ┌─────────┐ ┌─────────┐ ┌───────────────────┐  │
   │  │  抓包    │ │  发包    │ │  协议探查          │  │
   │  │ (Hook)  │ │ (send)  │ │ (listModules等)   │  │
   │  └─────────┘ └─────────┘ └───────────────────┘  │
   └──────────┬───────────────┬───────────────────────┘
              │               │
    ┌─────────┼───────┐       │
    ↓         ↓       ↓       ↓
  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────────┐ ┌──────────┐
  │jb.txt│ │crack │ │forge │ │gm_force  │ │collect   │
  │(抓包) │ │_build│ │_login│ │  .js     │ │_players  │
  │      │ │skin  │ │ .js  │ │(GM激活)  │ │  .js     │
  └──────┘ └──────┘ └──────┘ └──────────┘ └──────────┘
      │         │        │         │            │
      ↓         ↓        ↓         ↓            ↓
  ┌──────────────────────────────────────────────────┐
  │              send_helper.js (发包辅助)             │
  └──────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────┐
  │            Python 签名工具 (HTTP API)              │
  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐   │
  │  │ 版本1.py  │ │ 版本2.py  │ │登录链接 (2).py │   │
  │  └──────────┘ └──────────┘ └────────────────┘   │
  └──────────────────────────────────────────────────┘
```

---

## 10. 项目运行方式

### 10.1 环境要求

| 组件 | 要求 |
|------|------|
| 浏览器 | Chrome (推荐) 或 Edge |
| Python | 3.6+ (用于运行 Python 签名工具) |
| Node.js | 可选 (用于本地 HTTP 服务) |
| 网络 | 能够访问 `sdk.ygkksy.com` 和 `game.ygkksy.com` |

### 10.2 游戏启动流程

```
1. 打开 Chrome 浏览器
2. 访问 SDK 登录页: http://sdk.ygkksy.com:9000/login
3. 输入账号密码（如：13226410251 / Wonkef-ragci2-duqcuq）
4. 点击"进入游戏"
5. 等待游戏 Canvas 加载完成（约 30 秒）
6. 此时可在 Console 中执行逆向脚本
```

### 10.3 工具脚本使用方式

**aq.js — 一体化工具**：

```javascript
// 在游戏页面 Console 中粘贴 aq.js 全部内容，回车执行
// 功能就绪后显示：
// [阿庆工具] v1.0 就绪 (4 钩子)

// 发包示例
go(24, 5, {handBookType: 1, code: 250005009})
sendByName("HandBookProxy", "GetStarHandBookPoint", {...})

// 探查示例
listModules()        // 列出所有模块
listCommands(24)     // 列出模块 24 的命令
inspectProto(24, 5)  // 查看协议字段
```

**jb.txt — 协议抓包**：

```javascript
// 前置：在 index.0f8ab.js 第1行 第20568696列 设断点
// 在 Console 中粘贴 jb.txt 全部内容，回车执行
// 协议日志将输出到 Console 并存入 window._aq_protocol_log
```

**crack_buildskin.js — 破解脚本**：

```javascript
// 在 Console 中粘贴全部内容，回车执行
unlockBuildSkin(1)           // 解锁皮肤 #1
unlockAllBuildSkins()        // 批量解锁所有皮肤
changeName("新名字")          // 免费改名
```

**forge_login.js — 伪造登录**：

```javascript
// 修改脚本顶部 TARGET_ACCOUNT 和 TARGET_SERVER
// 在 Console 中粘贴全部内容，回车执行
// 5秒后自动验证登录结果
verifyLogin()                // 手动验证
```

**gm_force.js — GM 面板激活**：

```javascript
// 在 Console 中粘贴全部内容，回车执行
// GM 面板将自动打开
// 注意：执行 GM 命令会导致断线
```

**collect_players.js — 数据采集**：

```javascript
// 方案A（需先执行 aq.js）
// 执行 aq.js 后，再执行本脚本
// 自动监听 _aq_protocol_log 采集数据

// 方案B（独立运行）
hookSocketMgrForCollection() // 直接 Hook SocketMgr
showCollectedData()          // 查看结果
copyCollectedData()          // 复制到剪贴板
```

**Python 脚本**：

```bash
# 生成 pay_goods_list 签名 (area=1)
python 版本1.py

# 生成 pay_goods_list 签名 (area=3)
python 版本2.py

# 生成 login 签名
python 登录链接\ \(2\).py
```

### 10.4 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 脚本报错 `cc is not defined` | 游戏未加载完成 | 等待 Canvas 渲染后再执行 |
| `SocketMgr 不可用` | WebSocket 未连接 | 先进入游戏再执行脚本 |
| 协议日志显示 `[instanceof e]` | Protobuf 序列化问题 | 使用 jb.txt v4.2 版本 |
| GM 命令执行后断线 | 服务端 GM 权限校验 | 这是正常行为，非 GM 账号无法执行 |
| `Uncaught SyntaxError` | 模板字符串不兼容 | 使用 ES5 兼容版本脚本 |

---

## 附录 A：文档索引

| 文档 | 路径 | 内容 |
|------|------|------|
| 完整逆向工程手册 | `逆向工程完整手册.md` | 系统总览、所有操作流程、源码位置索引 |
| 核心逆向工程报告 | `核心逆向工程报告.md` | Sign 签名逆向、登录漏洞分析 |
| 协议逆向分析报告 | `协议逆向分析报告.md` | WebSocket 协议结构、数据帧格式 |
| GM 断线分析报告 | `GM断线分析与绕过评估报告.md` | GM 系统断线原理与绕过评估 |
| 完整破解测试报告 | `金手指游戏_完整逆向分析与破解测试报告.md` | 全量协议字典、漏洞总结、安全建议 |

## 附录 B：快捷键参考

| 命令 | 用途 |
|------|------|
| `go(mod, cmd, data)` | 快速发包 |
| `sendByName(name, cmd, data)` | 按名称发包 |
| `listModules()` | 列出所有模块 |
| `listCommands(modId)` | 列出模块命令 |
| `inspectProto(modId, cmdId)` | 查看协议字段 |
| `verifyLogin()` | 验证登录状态 |
| `showCollectedData()` | 查看采集数据 |
| `copyCollectedData()` | 复制采集数据 |
| `unlockBuildSkin(id)` | 解锁建筑皮肤 |
| `unlockAllBuildSkins()` | 批量解锁皮肤 |
| `changeName(name)` | 改名 |