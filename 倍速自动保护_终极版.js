// ==UserScript==
// @name         MyCocos - 倍速自动保护终极版（缓冲防检测+结算包补偿+iOS兼容）
// @namespace    http://tampermonkey.net/
// @version      4.0.0
// @description  缓冲防检测 + 沙盒突破注入 + 结算包endFrame/operFrame等比缩放 + 速度异常弹窗拦截 + 防断连 + Spine安全 + 退出战斗自动清理 (iOS Safari 兼容)
// @author       Ace
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @allFrames    true
// @inject-into  content
// ==/UserScript==

/**
 * 外层：沙盒突破注入器
 * iOS Userscripts 运行在隔离沙盒中，window.cc 为 undefined
 * 必须通过 script 标签将核心逻辑注入到页面主上下文
 */
(function () {
    'use strict';

    function run() {
        if (window.__AQ_GUARD_INJECTED__) return;
        window.__AQ_GUARD_INJECTED__ = true;

        var script = document.createElement('script');
        script.textContent = '(' + InjectableCore.toString() + ')();';
        (document.head || document.documentElement).appendChild(script);
        console.log('[SpeedGuard] 注入指令已发出（Page Context）');
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        run();
    } else {
        window.addEventListener('load', run);
        document.addEventListener('DOMContentLoaded', run);
    }

    /**
     * 核心逻辑：在页面主上下文中执行
     * 此函数会被序列化为字符串注入 script 标签，因此：
     * - 不能引用外部变量（只能用 window）
     * - 不能使用 ES6 箭头函数（iOS Safari 兼容）
     * - 不能使用模板字符串（部分旧版 iOS 不支持）
     */
    function InjectableCore() {
        if (window._aq_guard_v3) return;
        window._aq_guard_v3 = true;

        // ========== 配置 ==========
        var CONFIG = {
            DEFAULT_SPEED: 8,
            BATTLE_TYPE: 3,
            CHECK_SPEED_KEY: 40003,
            TD_EVENT: {
                TimeSpeedUpdate: 13,
                LocalSetSpeed: 17
            },
            PROTOCOL: {
                MODULE_BUILD_PROXY: 82,
                MODULE_BUILD_WORLD_PROXY: 93,
                CMD_QUIT_ROOM: 4,
                TICK_INTERVAL_IN_SEC: 10
            },
            BUFFER: {
                INITIAL_DELAY: 3000,
                RESET_DELAY_MIN: 1500,
                RESET_DELAY_MAX: 3000,
                WATCHDOG_INTERVAL: 1000,
                MIN_BUFFER_SPEED: 1.0,
                RAMP_SPEEDS: [2, 4, 8],
                RAMP_INTERVAL: 600
            }
        };

        // ========== 状态 ==========
        window._aq_guard = {
            target: CONFIG.DEFAULT_SPEED,
            enabled: false,
            corrections: 0,
            lastCorrected: 0,
            lastResetTime: 0,
            pendingRestoreTimer: null,
            battleStartTime: 0,
            inBuffer: false,
            initialApplied: false,
            rampTimer: null,
            currentScale: 1,
            _blockClose: false
        };

        // ========== 工具函数 ==========
        function log(msg) {
            console.log('[SpeedGuard] ' + msg);
        }

        function showToast(msg, color) {
            if (!color) color = '#00ff00';
            var t = document.createElement('div');
            // iOS Safari 兼容：使用 cssText 而非 style 赋值
            t.style.cssText = 'position:fixed;top:12%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);color:' + color + ';padding:14px 22px;border-radius:12px;z-index:9999999;font-size:14px;max-width:320px;pointer-events:none;font-weight:bold;';
            t.innerText = msg;
            // iOS Safari 兼容：document.body 可能不存在
            (document.body || document.documentElement).appendChild(t);
            setTimeout(function() {
                t.style.opacity = '0';
                t.style.transition = 'opacity 0.3s';
                setTimeout(function() {
                    // iOS Safari 兼容：使用 removeChild 而非 remove()
                    if (t.parentNode) t.parentNode.removeChild(t);
                }, 300);
            }, 3000);
        }

        function getBattleFrameIns() {
            // 方式1：通过 .Ins 静态属性（部分版本支持）
            var names = ['BattleFrame', 'TDBattleFrame', 'TDBattleTeamFrame'];
            for (var i = 0; i < names.length; i++) {
                var cls = cc.js.getClassByName(names[i]);
                if (cls && cls.Ins && cls.Ins._battleMain) return cls.Ins;
            }
            // 方式2：通过 Hook 捕获的实例引用
            if (window._aq_guard._capturedBfIns && window._aq_guard._capturedBfIns._battleMain) {
                return window._aq_guard._capturedBfIns;
            }
            // 方式3：递归搜索场景树（深度30层）查找带 _battleMain 的组件
            try {
                var scene = cc.director.getScene();
                if (scene) {
                    function searchNode(node, depth) {
                        if (depth > 30) return null;
                        var comps = node.getComponents ? node.getComponents(cc.Component) : [];
                        for (var i = 0; i < comps.length; i++) {
                            if (comps[i]._battleMain) return comps[i];
                        }
                        if (node.children) {
                            for (var j = 0; j < node.children.length; j++) {
                                var found = searchNode(node.children[j], depth + 1);
                                if (found) return found;
                            }
                        }
                        return null;
                    }
                    var found = searchNode(scene, 0);
                    if (found) return found;
                }
            } catch(e) {}
            // 方式4：通过 BattleMainLoop 查找（新版速度控制路径）
            try {
                var scene2 = cc.director.getScene();
                if (scene2) {
                    function searchBML(node, depth) {
                        if (depth > 30 || !node) return null;
                        try {
                            var comps = node.getComponents ? node.getComponents(cc.Component) : [];
                            for (var i = 0; i < comps.length; i++) {
                                if (cc.js.getClassName(comps[i]) === 'BattleMainLoop' && comps[i]._inBattle) {
                                    return comps[i];
                                }
                            }
                        } catch(e) {}
                        if (node.children) {
                            for (var j = 0; j < node.children.length; j++) {
                                var found = searchBML(node.children[j], depth + 1);
                                if (found) return found;
                            }
                        }
                        return null;
                    }
                    var bml = searchBML(scene2, 0);
                    if (bml) return bml;
                }
            } catch(e) {}
            return null;
        }

        function getBattleEntityMgr() {
            try {
                var scene = cc.director.getScene();
                if (!scene) return null;
                function searchBEM(node, depth) {
                    if (depth > 30 || !node) return null;
                    try {
                        var comps = node.getComponents ? node.getComponents(cc.Component) : [];
                        for (var i = 0; i < comps.length; i++) {
                            if (cc.js.getClassName(comps[i]) === 'BattleEntityMgr') return comps[i];
                        }
                    } catch(e) {}
                    if (node.children) {
                        for (var j = 0; j < node.children.length; j++) {
                            var found = searchBEM(node.children[j], depth + 1);
                            if (found) return found;
                        }
                    }
                    return null;
                }
                return searchBEM(scene, 0);
            } catch(e) { return null; }
        }

        // ========== 倍速应用函数 ==========
        function applyTargetSpeed() {
            try {
                var bfIns = getBattleFrameIns();
                if (bfIns) {
                    var applied = false;
                    // 新版路径：BattleMainLoop.setTimeScale
                    if (bfIns.setTimeScale && bfIns._inBattle !== undefined) {
                        bfIns.setTimeScale(window._aq_guard.target);
                        applied = true;
                    }
                    // 旧版路径：_battleMain.setTimeScale
                    if (bfIns._battleMain && bfIns._battleMain.setTimeScale) {
                        bfIns._battleMain.setTimeScale(window._aq_guard.target);
                        applied = true;
                    }
                    // 同步 BattleEntityMgr
                    var BEM = getBattleEntityMgr();
                    if (BEM && BEM.setTimeScale) {
                        BEM.setTimeScale(window._aq_guard.target);
                    }
                    // BM 缓存修正
                    var BM = cc.js.getClassByName('BattleModule');
                    if (BM && BM.Ins) {
                        if (bfIns._battleType != null) {
                            BM.Ins.setSpeedByBattleType(bfIns._battleType, window._aq_guard.target);
                        } else {
                            BM.Ins.setSpeedByBattleType(CONFIG.BATTLE_TYPE, window._aq_guard.target);
                        }
                    }
                    if (applied) {
                        window._aq_guard.currentScale = window._aq_guard.target;
                        return true;
                    }
                }
                // 回退方案：通过 TDModule 事件分发
                var TD = cc.js.getClassByName('TDModule');
                if (TD && TD.Ins) {
                    log('applyTargetSpeed: bfIns not found, dispatching LocalSetSpeed event');
                    TD.Ins.dispatchEvent(CONFIG.TD_EVENT.LocalSetSpeed, window._aq_guard.target);
                    window._aq_guard.currentScale = window._aq_guard.target;
                    return true;
                }
                return false;
            } catch(e) {
                log('applyTargetSpeed error: ' + e.message);
                return false;
            }
        }

        function applyTargetSpeedWithRamp() {
            if (window._aq_guard.rampTimer) {
                clearTimeout(window._aq_guard.rampTimer);
                window._aq_guard.rampTimer = null;
            }

            var stages = CONFIG.BUFFER.RAMP_SPEEDS;
            var target = window._aq_guard.target;
            var stageIndex = 0;

            function applyStage() {
                if (stageIndex >= stages.length) {
                    window._aq_guard.rampTimer = null;
                    window._aq_guard.currentScale = target;
                    log('Ramp complete: ' + target + 'x');
                    return;
                }

                var stageSpeed = stages[stageIndex];
                if (stageSpeed > target) stageSpeed = target;

                try {
                    var bfIns = getBattleFrameIns();
                    if (bfIns) {
                        if (bfIns.setTimeScale && bfIns._inBattle !== undefined) {
                            bfIns.setTimeScale(stageSpeed);
                        }
                        if (bfIns._battleMain && bfIns._battleMain.setTimeScale) {
                            bfIns._battleMain.setTimeScale(stageSpeed);
                        }
                        var BEM = getBattleEntityMgr();
                        if (BEM && BEM.setTimeScale) {
                            BEM.setTimeScale(stageSpeed);
                        }
                        window._aq_guard.currentScale = stageSpeed;
                        log('Ramp stage ' + (stageIndex + 1) + ': ' + stageSpeed + 'x');
                    }
                } catch(e) {}

                stageIndex++;
                window._aq_guard.rampTimer = setTimeout(applyStage, CONFIG.BUFFER.RAMP_INTERVAL);
            }

            applyStage();
        }

        function scheduleSpeedRestore(reason) {
            if (window._aq_guard.pendingRestoreTimer) {
                clearTimeout(window._aq_guard.pendingRestoreTimer);
            }
            if (window._aq_guard.rampTimer) {
                clearTimeout(window._aq_guard.rampTimer);
                window._aq_guard.rampTimer = null;
            }

            window._aq_guard.inBuffer = true;
            window._aq_guard.lastResetTime = Date.now();

            var delay = CONFIG.BUFFER.RESET_DELAY_MIN +
                        Math.random() * (CONFIG.BUFFER.RESET_DELAY_MAX - CONFIG.BUFFER.RESET_DELAY_MIN);

            log('Buffer start (' + (reason || 'unknown') + '), restore in ' + Math.round(delay) + 'ms');

            window._aq_guard.pendingRestoreTimer = setTimeout(function() {
                window._aq_guard.inBuffer = false;
                window._aq_guard.pendingRestoreTimer = null;
                log('Buffer end, ramping to ' + window._aq_guard.target + 'x');
                applyTargetSpeedWithRamp();
            }, delay);
        }

        function scheduleInitialSpeed() {
            window._aq_guard.inBuffer = true;
            log('Initial delay: ' + CONFIG.BUFFER.INITIAL_DELAY + 'ms before first speedup');

            window._aq_guard.pendingRestoreTimer = setTimeout(function() {
                window._aq_guard.inBuffer = false;
                window._aq_guard.pendingRestoreTimer = null;
                window._aq_guard.initialApplied = true;
                log('Initial delay complete, ramping to ' + window._aq_guard.target + 'x');
                applyTargetSpeedWithRamp();
            }, CONFIG.BUFFER.INITIAL_DELAY);
        }

        // ========== 安装拦截 ==========
        function installGuard() {

            // 1. BM缓存修正
            try {
                var BM = cc.js.getClassByName('BattleModule');
                if (BM && BM.Ins) {
                    BM.Ins.setSpeedByBattleType(CONFIG.BATTLE_TYPE, window._aq_guard.target);
                    var origGet = BM.Ins.getSpeedByBattleType;
                    if (origGet && !BM.Ins._guardGetHooked) {
                        BM.Ins.getSpeedByBattleType = function(bt) {
                            var r = origGet.apply(this, arguments);
                            if (window._aq_guard.enabled && !window._aq_guard.inBuffer && r > 0 && r < window._aq_guard.target) {
                                log('BM.getSpeedByBattleType(' + bt + ')=' + r + ' -> ' + window._aq_guard.target);
                                return window._aq_guard.target;
                            }
                            return r;
                        };
                        BM.Ins._guardGetHooked = true;
                    }
                    log('BattleModule cache corrected to ' + window._aq_guard.target + 'x');
                }
            } catch(e) { log('BM hook error: ' + e.message); }

            // 2. TDModule.dispatchEvent 拦截
            try {
                var TD = cc.js.getClassByName('TDModule');
                if (TD && TD.Ins && !TD.Ins._guardHooked) {
                    var origDisp = TD.Ins.dispatchEvent;
                    TD.Ins.dispatchEvent = function() {
                        var args = Array.prototype.slice.call(arguments);

                        if (args[0] === CONFIG.TD_EVENT.LocalSetSpeed && window._aq_guard.enabled) {
                            var origVal = args[1];
                            if (Array.isArray(origVal)) origVal = origVal[0];

                            if (origVal !== undefined) {
                                if (origVal < CONFIG.BUFFER.MIN_BUFFER_SPEED) {
                                    log('LocalSetSpeed(' + origVal + ') -> ' + CONFIG.BUFFER.MIN_BUFFER_SPEED + ' (buffer cap)');
                                    if (Array.isArray(args[1])) args[1] = [CONFIG.BUFFER.MIN_BUFFER_SPEED];
                                    else args[1] = CONFIG.BUFFER.MIN_BUFFER_SPEED;
                                }

                                if (origVal !== window._aq_guard.target) {
                                    window._aq_guard.corrections++;
                                    window._aq_guard.lastCorrected = Date.now();
                                    scheduleSpeedRestore('LocalSetSpeed=' + origVal);
                                }
                            }
                        }

                        if (args[0] === CONFIG.TD_EVENT.TimeSpeedUpdate && window._aq_guard.enabled) {
                            var origSpd = args[1];
                            if (Array.isArray(origSpd)) origSpd = origSpd[0];
                            if (origSpd !== undefined && origSpd !== window._aq_guard.target && !window._aq_guard.inBuffer) {
                                log('TimeSpeedUpdate(' + origSpd + ') -> ' + window._aq_guard.target);
                                if (Array.isArray(args[1])) args[1] = [window._aq_guard.target];
                                else args[1] = window._aq_guard.target;
                            }
                        }

                        return origDisp.apply(this, args);
                    };
                    TD.Ins._guardHooked = true;
                    log('TDModule.dispatchEvent guard installed (buffer-aware)');
                }
            } catch(e) { log('TD hook error: ' + e.message); }

            // 3. 子类 _setLoacalSpeed 和 _setTimeSpeed 拦截
            var frameClasses = ['TDBattleFrame', 'TDBattleTeamFrame'];
            frameClasses.forEach(function(className) {
                try {
                    var cls = cc.js.getClassByName(className);
                    if (!cls || !cls.prototype || cls.prototype._guardHooked) return;

                    var origLocal = cls.prototype._setLoacalSpeed;
                    if (origLocal) {
                        cls.prototype._setLoacalSpeed = function(e, t) {
                            if (window._aq_guard.enabled) {
                                var val = t && t[0];
                                if (val !== undefined) {
                                    if (val < CONFIG.BUFFER.MIN_BUFFER_SPEED) {
                                        log(className + '._setLoacalSpeed(' + val + ') -> ' + CONFIG.BUFFER.MIN_BUFFER_SPEED + ' (buffer cap)');
                                        if (t && t.length) t[0] = CONFIG.BUFFER.MIN_BUFFER_SPEED;
                                        else t = [CONFIG.BUFFER.MIN_BUFFER_SPEED];
                                        val = CONFIG.BUFFER.MIN_BUFFER_SPEED;
                                    }
                                    if (val !== window._aq_guard.target) {
                                        window._aq_guard.corrections++;
                                        window._aq_guard.lastCorrected = Date.now();
                                        scheduleSpeedRestore(className + '._setLoacalSpeed=' + val);
                                    }
                                }
                            }
                            return origLocal.apply(this, arguments);
                        };
                    }

                    var origSetTime = cls.prototype._setTimeSpeed;
                    if (origSetTime) {
                        cls.prototype._setTimeSpeed = function(e) {
                            if (window._aq_guard.enabled) {
                                scheduleSpeedRestore(className + '._setTimeSpeed=' + e);
                                log(className + '._setTimeSpeed blocked, scheduled restore');
                                return;
                            }
                            return origSetTime.apply(this, arguments);
                        };
                    }

                    cls.prototype._guardHooked = true;
                    log(className + ' guards installed (buffer-aware)');
                } catch(e) { log(className + ' hook error: ' + e.message); }
            });

            // 4. BattleFrame._onButtonSpeed 拦截
            try {
                var BF = cc.js.getClassByName('BattleFrame');
                if (BF && BF.prototype && !BF.prototype._guardHooked) {
                    var origBtn = BF.prototype._onButtonSpeed;
                    if (origBtn) {
                        BF.prototype._onButtonSpeed = function(e) {
                            if (window._aq_guard.enabled) {
                                log('BF._onButtonSpeed intercepted, scheduling restore');
                                scheduleSpeedRestore('button_click');
                                return;
                            }
                            return origBtn.apply(this, arguments);
                        };
                    }
                    BF.prototype._guardHooked = true;
                    log('BattleFrame._onButtonSpeed guard installed');
                }
            } catch(e) { log('BF hook error: ' + e.message); }

            // 5. Spine 动画保护
            try {
                var scene = cc.director.getScene();
                var spinePatched = 0;
                function patchSpineUpdate(node, depth) {
                    if (depth > 10) return;
                    var comps = node.getComponents ? node.getComponents(cc.Component) : [];
                    for (var i = 0; i < comps.length; i++) {
                        var c = comps[i];
                        try {
                            if (c.update && !c._spinePatched) {
                                var updateStr = c.update.toString();
                                if (updateStr.indexOf('isCustomUpdate') >= 0 || updateStr.indexOf('prototype.update') >= 0) {
                                    var origUpdate = c.update.bind(c);
                                    c.update = function(dt) {
                                        try { origUpdate(dt); } catch(e) {}
                                    };
                                    c._spinePatched = true;
                                    spinePatched++;
                                }
                            }
                        } catch(e) {}
                    }
                    if (node.children) {
                        for (var j = 0; j < node.children.length; j++) patchSpineUpdate(node.children[j], depth+1);
                    }
                }
                if (scene && scene.children[0]) patchSpineUpdate(scene.children[0], 0);
                log('Spine update protection: ' + spinePatched + ' components patched');
            } catch(e) { log('Spine patch error: ' + e.message); }

            // 6. 看门狗
            var watchdog = setInterval(function() {
                try {
                    var bfIns = getBattleFrameIns();
                    var isInBattle = bfIns && (bfIns._inBattle === true || (bfIns._inBattle === undefined && bfIns._battleMain));
                    if (isInBattle) {
                        if (!window._aq_guard.enabled) {
                            window._aq_guard.enabled = true;
                            window._aq_guard.battleStartTime = Date.now();
                            log('Battle detected! Initial delay: ' + CONFIG.BUFFER.INITIAL_DELAY + 'ms');
                            scheduleInitialSpeed();
                            return;
                        }

                        if (window._aq_guard.inBuffer) return;
                        if (window._aq_guard.pendingRestoreTimer) return;
                        if (window._aq_guard.rampTimer) return;
                        if (!window._aq_guard.initialApplied) return;

                        var currentScale = window._aq_guard.currentScale || 1;
                        if (currentScale > 0 && currentScale < window._aq_guard.target) {
                            log('Watchdog: speed=' + currentScale + ' < target=' + window._aq_guard.target + ', restoring');
                            applyTargetSpeed();
                        }
                    } else {
                        if (window._aq_guard.enabled) {
                            log('Battle ended, cleaning up...');
                            window._aq_guard.enabled = false;
                            window._aq_guard.initialApplied = false;
                            window._aq_guard.inBuffer = false;
                            window._aq_guard.currentScale = 1;

                            if (window._aq_guard.pendingRestoreTimer) {
                                clearTimeout(window._aq_guard.pendingRestoreTimer);
                                window._aq_guard.pendingRestoreTimer = null;
                            }
                            if (window._aq_guard.rampTimer) {
                                clearTimeout(window._aq_guard.rampTimer);
                                window._aq_guard.rampTimer = null;
                            }

                            var scheduler = cc.director.getScheduler();
                            if (scheduler) scheduler.setTimeScale(1);

                            try {
                                var scene2 = cc.director.getScene();
                                if (scene2 && scene2.children[0]) {
                                    function clearSpineTracks(node, depth) {
                                        if (depth > 10) return;
                                        var comps = node.getComponents ? node.getComponents(cc.Component) : [];
                                        for (var i = 0; i < comps.length; i++) {
                                            var c = comps[i];
                                            try {
                                                if (c._state && c._state.clearTracks) {
                                                    c._state.clearTracks();
                                                }
                                            } catch(e) {}
                                        }
                                        if (node.children) {
                                            for (var j = 0; j < node.children.length; j++) clearSpineTracks(node.children[j], depth+1);
                                        }
                                    }
                                    clearSpineTracks(scene2.children[0], 0);
                                    log('Spine tracks cleared on battle exit');
                                }
                            } catch(e) { log('Spine cleanup error: ' + e.message); }
                        }
                    }
                } catch(e) {}
            }, CONFIG.BUFFER.WATCHDOG_INTERVAL);
            window._aq_guard._timer = watchdog;

            // 7. 关闭客户端速度检测
            try {
                var SDKMgr = cc.js.getClassByName('SDKMgr');
                if (SDKMgr && SDKMgr.Ins && SDKMgr.Ins.performConfig) {
                    var checkTimer = setInterval(function() {
                        try {
                            if (SDKMgr.Ins.performConfig) {
                                SDKMgr.Ins.performConfig[CONFIG.CHECK_SPEED_KEY] = false;
                                clearInterval(checkTimer);
                                log('Speed check disabled');
                            }
                        } catch(e) {}
                    }, 500);
                }
            } catch(e) {}

            // 8. SocketMgr.send 结算包补偿（核心防检测）
            // 拦截 QuitRoom 请求(module=82/93, cmd=4)，将 endFrame/totalTime/operFrame 按 SPEED 等比缩放
            // 使服务端校验的 totalTime 匹配真实经过时间，避免错误码 10000361
            try {
                var SM = cc.js.getClassByName('SocketMgr');
                if (SM && SM.prototype && SM.prototype.send && !SM.prototype._guardSendHooked) {
                    var origSend = SM.prototype.send;
                    SM.prototype.send = function(moduleId, cmdId, data, callbacks) {
                        try {
                            if ((moduleId === CONFIG.PROTOCOL.MODULE_BUILD_PROXY ||
                                 moduleId === CONFIG.PROTOCOL.MODULE_BUILD_WORLD_PROXY) &&
                                cmdId === CONFIG.PROTOCOL.CMD_QUIT_ROOM &&
                                data && data.endFrame != null &&
                                window._aq_guard.target > 1) {

                                var scale = window._aq_guard.target;
                                var rawEndFrame = data.endFrame;
                                var rawTotalTime = data.totalTime;

                                data.endFrame = Math.floor(rawEndFrame / scale);

                                if (data.totalTime != null) {
                                    data.totalTime = Math.floor(data.endFrame / CONFIG.PROTOCOL.TICK_INTERVAL_IN_SEC);
                                }

                                var opCount = 0;
                                if (data.operations) {
                                    var ops = data.operations;
                                    if (typeof ops.getValues === 'function') {
                                        ops = ops.getValues();
                                    } else if (Array.isArray(ops)) {
                                        // already array
                                    } else if (typeof ops === 'object') {
                                        var newArr = [];
                                        var keys = Object.keys(ops);
                                        for (var k = 0; k < keys.length; k++) {
                                            if (keys[k].charAt(0) !== '_') {
                                                newArr.push(ops[keys[k]]);
                                            }
                                        }
                                        ops = newArr;
                                    }
                                    for (var oi = 0; oi < ops.length; oi++) {
                                        var op = ops[oi];
                                        if (op && op.operFrame != null && op.operFrame > 0) {
                                            op.operFrame = Math.floor(op.operFrame / scale);
                                            opCount++;
                                        }
                                    }
                                }

                                log('=== 退房补偿 ===');
                                log('endFrame: ' + rawEndFrame + ' -> ' + data.endFrame + ' (/' + scale + ')');
                                log('totalTime: ' + rawTotalTime + ' -> ' + data.totalTime);
                                log('operations: ' + opCount + ' 条 operFrame 已补偿');
                                log('================');
                            }
                        } catch(e) { log('SocketMgr.send compensate error: ' + e.message); }
                        return origSend.apply(this, arguments);
                    };
                    SM.prototype._guardSendHooked = true;
                    log('SocketMgr.send 结算包补偿已安装');
                }
            } catch(e) { log('SocketMgr.send hook error: ' + e.message); }

            // 9. UIMgr.open 拦截速度异常弹窗
            // _checkCheat 触发时调用 UIMgr.open 显示"检查到速度异常"弹窗
            // 拦截弹窗并设置 _blockClose 标记，阻止随后的 SocketMgr.close
            try {
                var UIMgr = cc.js.getClassByName('UIMgr');
                if (UIMgr && UIMgr.prototype && UIMgr.prototype.open && !UIMgr.prototype._guardHooked) {
                    var origOpen = UIMgr.prototype.open;
                    UIMgr.prototype.open = function(view, layerType, data) {
                        try {
                            if (data && data.commonTips) {
                                var tips = String(data.commonTips);
                                if (tips.indexOf('\u901f\u5ea6\u5f02\u5e38') >= 0 ||
                                    tips.indexOf('\u65ad\u5f00\u8fde\u63a5') >= 0) {
                                    log('拦截速度异常弹窗: ' + tips);
                                    window._aq_guard._blockClose = true;
                                    setTimeout(function() {
                                        window._aq_guard._blockClose = false;
                                    }, 2000);
                                    return null;
                                }
                            }
                        } catch(e) { log('UIMgr.open intercept error: ' + e.message); }
                        return origOpen.apply(this, arguments);
                    };
                    UIMgr.prototype._guardHooked = true;
                    log('UIMgr.open 弹窗拦截已安装');
                }
            } catch(e) { log('UIMgr hook error: ' + e.message); }

            // 10. SocketMgr.close 防断连保护
            // _checkCheet 触发弹窗后会调用 SocketMgr.close() 断开连接
            // 当 _blockClose=true 时阻断 close，保持连接
            try {
                var SM2 = cc.js.getClassByName('SocketMgr');
                if (SM2 && SM2.prototype && SM2.prototype.close && !SM2.prototype._guardCloseHooked) {
                    var origClose = SM2.prototype.close;
                    SM2.prototype.close = function() {
                        if (window._aq_guard._blockClose) {
                            log('阻断 SocketMgr.close (速度检测触发，保持连接)');
                            return;
                        }
                        return origClose.apply(this, arguments);
                    };
                    SM2.prototype._guardCloseHooked = true;
                    log('SocketMgr.close 防断连已安装');
                }
            } catch(e) { log('SocketMgr.close hook error: ' + e.message); }

            log('Speed Guard v4.0 (iOS + Protocol-Safe) installed. Target: ' + window._aq_guard.target + 'x');
        }

        // ========== 全局API ==========
        window.setGuardSpeed = function(n) {
            if (isNaN(n) || n <= 0 || n > 50) { log('Invalid: ' + n); return; }
            window._aq_guard.target = n;
            var BM = cc.js.getClassByName('BattleModule');
            if (BM && BM.Ins) BM.Ins.setSpeedByBattleType(CONFIG.BATTLE_TYPE, n);
            if (!window._aq_guard.inBuffer && window._aq_guard.initialApplied) {
                applyTargetSpeed();
            }
            showToast('Guard: ' + n + 'x', '#00ff00');
        };

        window.getGuardStatus = function() {
            var info = {
                target: window._aq_guard.target + 'x',
                enabled: window._aq_guard.enabled,
                inBuffer: window._aq_guard.inBuffer,
                initialApplied: window._aq_guard.initialApplied,
                currentScale: window._aq_guard.currentScale,
                corrections: window._aq_guard.corrections,
                lastCorrected: window._aq_guard.lastCorrected ? (Date.now() - window._aq_guard.lastCorrected) + 'ms ago' : 'never',
                battleDuration: window._aq_guard.battleStartTime ? Math.round((Date.now() - window._aq_guard.battleStartTime) / 1000) + 's' : 'not started',
                pendingRestore: window._aq_guard.pendingRestoreTimer ? 'yes' : 'no',
                rampActive: window._aq_guard.rampTimer ? 'yes' : 'no',
                blockClose: window._aq_guard._blockClose
            };
            console.log('[SpeedGuard] Status:', JSON.stringify(info, null, 2));
            return info;
        };

        window.checkGuardHooks = function() {
            var results = [];
            function check(name, fn) {
                try { results.push(name + ': ' + (fn() ? 'YES' : 'NO')); }
                catch(e) { results.push(name + ': ERROR ' + e.message); }
            }
            check('SocketMgr.send', function() {
                var SM = cc.js.getClassByName('SocketMgr');
                return SM && SM.prototype && SM.prototype._guardSendHooked === true;
            });
            check('UIMgr.open', function() {
                var UIMgr = cc.js.getClassByName('UIMgr');
                return UIMgr && UIMgr.prototype && UIMgr.prototype._guardHooked === true;
            });
            check('SocketMgr.close', function() {
                var SM = cc.js.getClassByName('SocketMgr');
                return SM && SM.prototype && SM.prototype._guardCloseHooked === true;
            });
            check('TDModule.dispatchEvent', function() {
                var TD = cc.js.getClassByName('TDModule');
                return TD && TD.Ins && TD.Ins._guardHooked === true;
            });
            check('BattleModule.getSpeedByBattleType', function() {
                var BM = cc.js.getClassByName('BattleModule');
                return BM && BM.Ins && BM.Ins._guardGetHooked === true;
            });
            check('SDKMgr.performConfig[40003]', function() {
                var SDKMgr = cc.js.getClassByName('SDKMgr');
                return SDKMgr && SDKMgr.Ins && SDKMgr.Ins.performConfig && SDKMgr.Ins.performConfig[40003] === false;
            });
            var output = results.join('\n');
            console.log('[SpeedGuard] Hook Status:\n' + output);
            return output;
        };

        window.triggerBuffer = function(reason) {
            scheduleSpeedRestore(reason || 'manual');
            showToast('Buffer triggered: ' + reason, '#ffcc00');
        };

        // ========== 启动 ==========
        function waitCocos(cb) {
            var timer = setInterval(function() {
                if (typeof cc !== 'undefined' && cc.js && cc.js.getClassByName) {
                    clearInterval(timer);
                    cb();
                }
            }, 500);
        }

        waitCocos(function() {
            log('Cocos ready, installing buffer guards...');
            installGuard();
            setTimeout(function() {
                showToast('Guard v4.0 ready: ' + CONFIG.DEFAULT_SPEED + 'x (iOS+Protocol)', '#00ff00');
            }, 800);
        });
    }
})();
