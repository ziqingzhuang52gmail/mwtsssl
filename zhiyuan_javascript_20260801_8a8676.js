// ==UserScript==
// @name         MyCocos - 阿庆破解脚本
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  资源劫持、免费改名、皮肤解锁等 (iOS 专用)
// @author       Ace
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function() {
    'use strict';

    // 标记是否已注入，防止重复执行
    if (window._aq_crack_installed) return;
    window._aq_crack_installed = true;

    // 等待 Cocos 引擎加载完成
    function waitForCocos(callback, timeout) {
        timeout = timeout || 30000; // 默认 30 秒超时
        var startTime = Date.now();
        var timer = setInterval(function() {
            if (typeof cc !== 'undefined' && cc.js && cc.js.getClassByName) {
                clearInterval(timer);
                callback();
                return;
            }
            if (Date.now() - startTime > timeout) {
                clearInterval(timer);
                console.warn('[阿庆破解] Cocos 引擎加载超时，请确保在游戏页面运行。');
            }
        }, 500);
    }

    waitForCocos(function() {
        // ============================================================
        // 以下为原脚本主体（原封不动，仅移除外部包裹）
        // ============================================================
        var V = "1.0";
        console.warn('[阿庆破解脚本] v' + V + ' 注入中...');

        // 存储原始函数引用
        window._aq_crack_orig = window._aq_crack_orig || {};

        // --- 1. Hook: BagModule.getItemNumByID → 始终返回 9999 ---
        try {
            var BagModule = cc.js.getClassByName('BagModule');
            if (BagModule && BagModule.Ins) {
                var origGetItemNum = BagModule.Ins.getItemNumByID;
                window._aq_crack_orig.getItemNumByID = origGetItemNum;
                BagModule.Ins.getItemNumByID = function(code) {
                    console.warn('[破解] getItemNumByID(' + code + ') → 9999 (原值:' + origGetItemNum.call(this, code) + ')');
                    return 9999;
                };
                console.warn('[破解] ✓ BagModule.getItemNumByID 已劫持');
            } else {
                console.warn('[破解] ✗ BagModule 不可用');
            }
        } catch(e) {
            console.warn('[破解] ✗ 劫持 getItemNumByID 失败: ' + e.message);
        }

        // --- 2. Hook: EntityDataParser.handleClientRewardAndCost → 拦截扣费 ---
        try {
            var EDP = cc.js.getClassByName('EntityDataParser');
            if (EDP && EDP.Ins) {
                var origHandleCost = EDP.Ins.handleClientRewardAndCost;
                window._aq_crack_orig.handleClientRewardAndCost = origHandleCost;
                EDP.Ins.handleClientRewardAndCost = function(campId, cost, isShow) {
                    if (cost && cost.items && cost.items.length > 0) {
                        var items = [];
                        for (var i = 0; i < cost.items.length; i++) {
                            try { items.push(cost.items.get(i).code + 'x' + cost.items.get(i).num); } catch(e) {}
                        }
                        console.warn('[破解] 拦截扣费: camp=' + campId + ' items=[' + items.join(', ') + ']');
                        // 不调用原始函数，跳过扣费
                    } else {
                        // 没有 cost 则正常处理
                        origHandleCost.call(this, campId, cost, isShow);
                    }
                };
                console.warn('[破解] ✓ EntityDataParser.handleClientRewardAndCost 已劫持');
            } else {
                console.warn('[破解] ✗ EntityDataParser 不可用');
            }
        } catch(e) {
            console.warn('[破解] ✗ 劫持 handleClientRewardAndCost 失败: ' + e.message);
        }

        // --- 3. 获取 SocketMgr 实例 ---
        var getSM = function() {
            try {
                var cls = cc.js.getClassByName('SocketMgr');
                return cls && cls.Ins ? cls.Ins : null;
            } catch(e) { return null; }
        };

        // --- 4. 核心破解功能 ---

        // 4.1 房间皮肤解锁 (BuildSkin Mod 91, Cmd 7 SkinUp)
        window.unlockBuildSkin = function(skinId, callback) {
            var sm = getSM();
            if (!sm) { console.error('[破解] SocketMgr 不可用'); return false; }
            try {
                sm.send(91, 7, {skinId: skinId}, callback ? [callback] : []);
                console.warn('[破解] 🏠 已发送皮肤解锁请求: skinId=' + skinId + ' (Mod 91 Cmd 7 SkinUp)');
                return true;
            } catch(e) {
                console.error('[破解] 发送失败: ' + e.message);
                return false;
            }
        };

        // 4.2 解锁所有已知房间皮肤
        window.unlockAllBuildSkins = function() {
            var count = 0;
            var interval = setInterval(function() {
                var skinId = count + 1;
                if (skinId > 1000) {
                    clearInterval(interval);
                    console.warn('[破解] 🏠 已尝试解锁全部 1000 个皮肤');
                    return;
                }
                window.unlockBuildSkin(skinId);
                count++;
            }, 100);
            console.warn('[破解] 🏠 开始批量解锁皮肤 (1~1000)...');
        };

        // 4.3 免费改名 (PlayerInfo Mod 13, Cmd 20 ChangeNameByCost)
        window.changeNameByCost = function(newName, callback) {
            var sm = getSM();
            if (!sm) { console.error('[破解] SocketMgr 不可用'); return false; }
            try {
                sm.send(13, 20, {name: newName}, callback ? [callback] : []);
                console.warn('[破解] 📝 已发送改名请求: name=' + newName + ' (Mod 13 Cmd 20 ChangeNameByCost)');
                return true;
            } catch(e) {
                console.error('[破解] 发送失败: ' + e.message);
                return false;
            }
        };

        // 4.4 免费改名 (PlayerInfo Mod 13, Cmd 6 ChangeName)
        window.changeName = function(newName, callback) {
            var sm = getSM();
            if (!sm) { console.error('[破解] SocketMgr 不可用'); return false; }
            try {
                sm.send(13, 6, {name: newName}, callback ? [callback] : []);
                console.warn('[破解] 📝 已发送改名请求: name=' + newName + ' (Mod 13 Cmd 6 ChangeName)');
                return true;
            } catch(e) {
                console.error('[破解] 发送失败: ' + e.message);
                return false;
            }
        };

        // --- 5. 辅助工具 ---

        // 5.1 列出所有模块
        window.listModules = function() {
            var sm = getSM();
            if (!sm) { console.error('[破解] SocketMgr 不可用'); return; }
            try {
                var dic = sm._moduleDic;
                var keys = [];
                for (var k in dic) {
                    if (dic.hasOwnProperty(k)) keys.push(parseInt(k));
                }
                keys.sort(function(a,b){return a-b;});
                console.warn('===== 模块列表 (共 ' + keys.length + ' 个) =====');
                for (var i = 0; i < keys.length; i++) {
                    console.warn('  ' + keys[i] + ': ' + dic[keys[i]]);
                }
            } catch(e) { console.error('获取模块列表失败: ' + e.message); }
        };

        // 5.2 列出指定模块的所有命令
        window.listCommands = function(moduleId) {
            var sm = getSM();
            if (!sm) { console.error('[破解] SocketMgr 不可用'); return; }
            try {
                var mn = sm.getModuleName ? sm.getModuleName(moduleId) : '?';
                var cmds = sm._cmdDic[moduleId];
                if (!cmds) {
                    console.warn('模块 ' + moduleId + ' (' + mn + ') 没有命令定义');
                    return;
                }
                var keys = [];
                for (var k in cmds) {
                    if (cmds.hasOwnProperty(k) && k !== '_keyList' && k !== '_valueList' && k !== '_isReadonly' && k !== '_keyToIndex' && k !== '_isIterating') {
                        keys.push(parseInt(k));
                    }
                }
                keys.sort(function(a,b){return a-b;});
                console.warn('===== 模块 ' + moduleId + ' (' + mn + ') 命令列表 (共 ' + keys.length + ' 个) =====');
                for (var i = 0; i < keys.length; i++) {
                    console.warn('  ' + keys[i] + ': ' + cmds[keys[i]]);
                }
            } catch(e) { console.error('获取命令列表失败: ' + e.message); }
        };

        // 5.3 通用发包
        window.send = function(moduleId, cmdId, data, callback) {
            var sm = getSM();
            if (!sm) { console.error('[破解] SocketMgr 不可用'); return false; }
            try {
                sm.send(moduleId, cmdId, data || {}, callback ? [callback] : []);
                var mn = sm.getModuleName ? sm.getModuleName(moduleId) : '?';
                var cn = sm.getCmdName ? sm.getCmdName(moduleId, cmdId) : '?';
                console.warn('[破解] 🚀 已发送: ' + mn + '.' + cn + ' (Mod ' + moduleId + ' Cmd ' + cmdId + ')');
                return true;
            } catch(e) {
                console.error('[破解] 发送失败: ' + e.message);
                return false;
            }
        };

        // --- 6. 验证 ---
        var sm = getSM();
        if (sm) {
            console.warn('[阿庆破解脚本] v' + V + ' 就绪');
            console.warn('可用命令:');
            console.warn('  🏠 unlockBuildSkin(skinId) - 解锁房间皮肤 (SSNV)');
            console.warn('  🏠 unlockAllBuildSkins() - 批量解锁所有皮肤');
            console.warn('  📝 changeName(\"新名字\") - 免费改名');
            console.warn('  📝 changeNameByCost(\"新名字\") - 付费改名(可能免费)');
            console.warn('  📋 send(mod, cmd, data) - 通用发包');
            console.warn('  📋 listModules() - 列出所有模块');
            console.warn('  📋 listCommands(mod) - 列出模块命令');
            console.warn('提示: BagModule.getItemNumByID 已劫持(返回9999)，扣费已拦截');
        } else {
            console.warn('[阿庆破解脚本] ✗ SocketMgr 不可用，请等待游戏加载后重试');
        }
        // ============================================================
        // 原脚本主体结束
        // ============================================================
    });

})();