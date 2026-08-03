// ==UserScript==
// @name         MyCocos - 局内伤害系统
// @description  属性注入 + 屏蔽转盘 (iOS Safari 专用)
// @author       Ace
// @version      6.3.1
// @match        *://*/*
// @grant        none
// @inject-into  content
// ==/UserScript==

(function () {
    'use strict';

    function InjectableCore() {
        const TAG = "[AceDamage]";
        const ATTR_ATK_ENUM = 5;
        const DEFAULT_ATK = 4616;
        let TARGET_ATK = DEFAULT_ATK;

        // --- iOS Safari 兼容提示系统 ---
        function showToast(msg, color, duration, onClick) {
            color = color || '#00ffff';
            duration = duration || 6000;
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;top:15%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);color:' + color + ';padding:15px 25px;border-radius:12px;z-index:9999999;font-size:14px;font-weight:bold;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.6);transition:all 0.4s ease;cursor:pointer;width:75%;max-width:350px;border:1px solid ' + color + ';line-height:1.5;';
            toast.innerHTML = msg + (onClick ? '<br><span style="font-size:11px;text-decoration:underline;opacity:0.8;">(点击设置伤害值)</span>' : '');
            const close = function() {
                if (toast.parentNode) {
                    toast.style.opacity = '0';
                    setTimeout(function() { toast.remove(); }, 500);
                }
            };
            toast.onclick = function() {
                if (onClick) onClick();
                close();
            };
            (document.body || document.documentElement).appendChild(toast);
            if (!onClick) setTimeout(close, duration);
        }

        console.log(TAG + ' 脚本环境已切入 Page Context');

        function checkReady() {
            if (window.cc && window.cc.js) {
                showToast('局内伤害系统已就绪\\n默认伤害: ' + DEFAULT_ATK.toLocaleString(), '#00ffff', 20000, function() {
                    // iOS Safari 兼容：setTimeout 延迟弹窗
                    setTimeout(function() {
                        var input = prompt('请输入目标伤害值:', DEFAULT_ATK);
                        if (input !== null) {
                            var val = parseInt(input, 10);
                            if (isNaN(val) || val <= 0) {
                                showToast('输入无效，使用默认值: ' + DEFAULT_ATK.toLocaleString(), '#ff6600', 3000);
                                TARGET_ATK = DEFAULT_ATK;
                            } else {
                                TARGET_ATK = val;
                                showToast('伤害值已设置: ' + TARGET_ATK.toLocaleString(), '#00ff00', 3000);
                            }
                        }
                        startIntegration(window);
                    }, 300);
                });
            } else {
                setTimeout(checkReady, 2000);
            }
        }

        function startIntegration(win) {
            const cc = win.cc;
            const req = win.__require;

            if (!req) {
                showToast('错误: 未能获取到模块加载器', '#ff0000');
                return;
            }

            function getModuleClass(moduleName, className) {
                try {
                    const mod = req(moduleName);
                    return mod ? (mod[className] || mod.default || mod) : null;
                } catch (e) { return null; }
            }

            // ───── 1. 屏蔽转盘 ─────
            try {
                const GMModule = cc.js.getClassByName('GMModule');
                if (GMModule) {
                    GMModule.BLOCK_ALL_LOTTERY = true;
                    console.log(TAG + ' 转盘已屏蔽');
                }
            } catch (e) {}

            // ───── 2. 伤害注入 ─────
            const TDServer = getModuleClass('TDServer', 'TDServer');
            const TDModule = getModuleClass('TDModule', 'TDModule');
            const TDPlayerEntity = getModuleClass('TDPlayerEntity', 'TDPlayerEntity');

            if (!TDServer || !TDModule || !TDPlayerEntity) {
                showToast('模块加载失败, 2秒后重试...', '#ff0000', 2000);
                setTimeout(function() { startIntegration(win); }, 2000);
                return;
            }

            if (TDPlayerEntity.prototype._aceHooked) {
                console.log(TAG + ' 已注入，跳过');
                showToast('伤害系统已激活\\n当前伤害: ' + TARGET_ATK.toLocaleString(), '#00ff00');
                return;
            }

            function injectPower(uuid) {
                try {
                    const delegate = TDServer.Ins._delegate;
                    const entityId = delegate.getAliveEntityIdByUuid(uuid, 1);
                    if (!entityId) {
                        setTimeout(function() { injectPower(uuid); }, 500);
                        return;
                    }
                    const entity = delegate._battleEngine.entity_by_id(entityId);
                    if (entity && !entity._aceHooked) {
                        const _orig = entity.get_attr_value;
                        entity.get_attr_value = function(t) {
                            if (t === ATTR_ATK_ENUM) return TARGET_ATK;
                            return _orig.apply(this, arguments);
                        };
                        entity._aceHooked = true;
                        console.log(TAG + ' 伤害注入成功 → ' + TARGET_ATK);
                    }
                } catch (e) {}
            }

            const _origCreateBuild = TDPlayerEntity.prototype.createBuild;
            TDPlayerEntity.prototype.createBuild = function(e) {
                const res = _origCreateBuild.apply(this, arguments);
                if (this.playerId === TDModule.Ins.playerId && e && e.type === 5) {
                    if (res && res.success && res.data) {
                        setTimeout(function() { injectPower(res.data.uuid); }, 500);
                    }
                }
                return res;
            };
            TDPlayerEntity.prototype._aceHooked = true;

            showToast('就绪\\n伤害: ' + TARGET_ATK.toLocaleString() + ' | 转盘: 已屏蔽', '#00ff00');
            console.log(TAG + ' 就绪 — 伤害:' + TARGET_ATK + ' | 转盘:已屏蔽');
        }

        checkReady();
    }

    function run() {
        if (window.__ACE_INJECTED__) return;
        window.__ACE_INJECTED__ = true;

        const script = document.createElement('script');
        script.textContent = '(' + InjectableCore.toString() + ')();';
        (document.head || document.documentElement).appendChild(script);
        console.log('[Ace] 局内伤害系统注入指令已发出');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        run();
    } else {
        window.addEventListener('load', run);
    }
})();