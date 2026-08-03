// ==UserScript==
// @name         MyCocos - 完全整合系统
// @description  资源锁定 + 建筑0CD + 属性注入 + 屏蔽转盘 (iOS Safari 专用) [智能上床已禁用]
// @author       Ace
// @version      6.3.1
// @match        *://*/*
// @grant        none
// @inject-into  content
// ==/UserScript==

(function () {
    'use strict';

    /**
     * 核心逻辑：InjectableCore
     * 作用：突破 UserScripts 的沙盒限制，直接在页面 Context 运行以访问 window.cc
     */
    function InjectableCore() {
        const TAG = "[AceIntegrated]";
        
        // --- 极简提示系统 ---
        function showToast(msg, color = '#00ffff', duration = 6000, onClick = null) {
            const toast = document.createElement('div');
            toast.style.cssText = `position:fixed;top:15%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);color:${color};padding:15px 25px;border-radius:12px;z-index:9999999;font-size:14px;font-weight:bold;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.6);transition:all 0.4s ease;cursor:pointer;width:75%;max-width:350px;border:1px solid ${color};line-height:1.5;`;
            toast.innerHTML = msg + (onClick ? "<br><span style='font-size:11px;text-decoration:underline;opacity:0.8;'>(点击激活功能)</span>" : "");
            
            const close = () => {
                if (toast.parentNode) {
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), 500);
                }
            };

            toast.onclick = () => {
                if (onClick) onClick();
                close();
            };

            (document.body || document.documentElement).appendChild(toast);
            if (!onClick) setTimeout(close, duration);
        }

        console.log(`${TAG} 脚本环境已切入 Page Context`);

        function checkReady() {
            // 检查 cc 是否存在
            if (window.cc && window.cc.js) {
                showToast("🚀 资源锁定、建筑0CD与集成系统已就绪", "#00ffff", 20000, () => {
                    startIntegration(window);
                });
            } else {
                // 如果没找到 cc，继续轮询
                setTimeout(checkReady, 2000);
            }
        }

        function startIntegration(win) {
            const cc = win.cc;
            const req = win.__require;
            
            if (!req) {
                showToast("❌ 错误: 未能获取到模块加载器", "#ff0000");
                return;
            }

            const getModuleClass = (moduleName, className) => {
                try {
                    const mod = req(moduleName);
                    return mod ? (mod[className] || mod.default || mod) : null;
                } catch(e) { return null; }
            };

            // 扩展 CONFIG，添加资源锁定和建筑0CD配置
            const CONFIG = {
                TARGET_ATK: 80616,
                ATTR_ATK_ENUM: 5,
                BATTLE_TYPES: { MAIN_LINE: 3, DAILY_FUBEN: 36 },
                ROOM_MAP: { 3: "6", 36: "1" },
                MOVE_SPEED: 3,
                RESOURCE_VAL: 2600, // 用户指定的资源值
                CORE_RESOURCES: [30600001, 30600002, 100001] // 用户指定的资源ID列表
            };

            // 1. 屏蔽转盘逻辑
            try {
                const GMModule = cc.js.getClassByName("GMModule");
                if (GMModule) {
                    GMModule.BLOCK_ALL_LOTTERY = true;
                }
            } catch (e) {}

            // 2. 资源锁定和建筑0CD劫持逻辑
            const TDServer = getModuleClass('TDServer', 'TDServer');
            if (TDServer && TDServer.prototype && !TDServer.prototype.__resourceHijacked) {
                const proto = TDServer.prototype;
                
                // 资源锁定：劫持 getItemNum 方法
                if (proto.getItemNum) {
                    const originalGetItemNum = proto.getItemNum;
                    proto.getItemNum = function(campId, itemId) {
                        if (CONFIG.CORE_RESOURCES.includes(itemId)) {
                            return CONFIG.RESOURCE_VAL; // 直接返回锁定值
                        }
                        return originalGetItemNum.apply(this, arguments);
                    };
                }

                // 建筑0CD：劫持 organ_Create_CD 属性
                try {
                    Object.defineProperty(proto, 'organ_Create_CD', {
                        get: function() { return 0; }, // 始终返回0，实现0CD
                        set: function(val) { this._organ_Create_CD = val; }, // 允许设置，避免错误
                        configurable: true
                    });
                } catch (e) {
                    console.error("建筑0CD劫持失败", e);
                }

                TDServer.prototype.__resourceHijacked = true;
                showToast("🔒 资源锁定和建筑0CD已激活", "#00ff00", 2000);
            }

            // 3. 战力注入逻辑（原文档2功能）
            const TDModule = getModuleClass('TDModule', 'TDModule');
            const TDPlayerEntity = getModuleClass('TDPlayerEntity', 'TDPlayerEntity');

            const injectPower = (uuid) => {
                try {
                    const delegate = TDServer.Ins._delegate;
                    const entityId = delegate.getAliveEntityIdByUuid(uuid, 1);
                    if (!entityId) {
                        setTimeout(() => injectPower(uuid), 500);
                        return;
                    }
                    const entity = delegate._battleEngine.entity_by_id(entityId);
                    if (entity && !entity._aceHooked) {
                        const _orig = entity.get_attr_value;
                        entity.get_attr_value = function(t) {
                            if (t === CONFIG.ATTR_ATK_ENUM) return CONFIG.TARGET_ATK;
                            return _orig.apply(this, arguments);
                        };
                        entity._aceHooked = true;
                        showToast("⚔️ 战力注入成功", "#00ff00", 2000);
                    }
                } catch(e) {}
            };

            if (TDPlayerEntity && !TDPlayerEntity.prototype.createBuild._aceHooked) {
                const _orig = TDPlayerEntity.prototype.createBuild;
                TDPlayerEntity.prototype.createBuild = function(e) {
                    const res = _orig.apply(this, arguments);
                    if (this.playerId === TDModule.Ins.playerId && e && e.type === 5) {
                        if (res && res.success && res.data) {
                            setTimeout(() => injectPower(res.data.uuid), 500);
                        }
                    }
                    return res;
                };
                TDPlayerEntity.prototype.createBuild._aceHooked = true;
            }

            // 4. 智能上床逻辑（已禁用 - 注释掉）
            /*
            const DirectorClass = cc.js.getClassByName('BattleTDBaseDirector');
            if (DirectorClass && !DirectorClass.prototype.beforeLogicTick._aceHooked) {
                const _origTick = DirectorClass.prototype.beforeLogicTick;
                DirectorClass.prototype.beforeLogicTick = function(tick) {
                    _origTick.apply(this, arguments);
                    const bType = TDServer.Ins.battleType;
                    const target = CONFIG.ROOM_MAP[bType];
                    if (target && !TDModule.Ins.myRoomId) {
                        if (tick === 10 && !this._aceAuto) {
                            showToast(`🛌 自动前往房间: ${target}`, "#ffcc00", 2000);
                            if (this._lookForBed) this._lookForBed(null, [target, CONFIG.MOVE_SPEED]);
                            this._aceAuto = true;
                        }
                    } else if (tick < 5) { this._aceAuto = false; }
                };
                DirectorClass.prototype.beforeLogicTick._aceHooked = true;
            }
            */

            showToast("✅ 资源锁定、建筑0CD与集成系统已全部激活", "#00ff00");
        }

        // 启动检测
        checkReady();
    }

    /**
     * 注入器逻辑
     * 将 InjectableCore 函数序列化并插入页面 script 标签中运行
     */
    function run() {
        // 防止重复注入
        if (window.__ACE_INJECTED__) return;
        window.__ACE_INJECTED__ = true;

        const script = document.createElement('script');
        script.textContent = `(${InjectableCore.toString()})();`;
        (document.head || document.documentElement).appendChild(script);
        console.log("[Ace] 集成脚本注入指令已发出");
    }

    // iOS 环境下的可靠注入
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        run();
    } else {
        window.addEventListener('load', run);
    }
})();