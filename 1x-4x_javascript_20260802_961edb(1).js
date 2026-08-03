// ==UserScript==
// @name         MyCocos - 战斗倍速 (3倍速)
// @namespace    http://tampermonkey.net/
// @version      9.1
// @description  劫持调度器实现3倍速，绕过速度检测 (iOS 专用)
// @author       Ace
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function() {
    'use strict';

    // 防止重复注入
    if (window._aq_speed_installed) return;
    window._aq_speed_installed = true;

    // 等待 Cocos 引擎加载
    function waitForCocos(callback, timeout) {
        timeout = timeout || 30000;
        var start = Date.now();
        var timer = setInterval(function() {
            if (typeof cc !== 'undefined' && cc.js && cc.js.getClassByName) {
                clearInterval(timer);
                callback();
                return;
            }
            if (Date.now() - start > timeout) {
                clearInterval(timer);
                console.warn('[AceHacker] Cocos 引擎加载超时，请确保在游戏页面运行。');
            }
        }, 500);
    }

    waitForCocos(function() {
        // ============================================================
        // 原脚本主体（SPEED = 3）
        // ============================================================
        var V = "9.1";

        // ★★★ 修改这里切换倍速 ★★★
        var SPEED = 4;  // 3, 4, 5

        var TAG = '[AceHacker]';
        function ok(msg)  { console.warn(TAG + ' ✓ ' + msg); }
        function fail(msg){ console.warn(TAG + ' ✗ ' + msg); }
        function info(msg){ console.warn(TAG + ' ℹ ' + msg); }

        console.warn('[AceHacker V' + V + '] ' + SPEED + '倍速 注入中...');
        window._aq_speed = window._aq_speed || {};
        window._aq_speed.target = SPEED;
        window._aq_speed.enabled = false;

        // Step 1: 绕过速度检测
        try {
            var SDKMgr = cc.js.getClassByName('SDKMgr');
            if (SDKMgr && SDKMgr.Ins) {
                if (!SDKMgr.Ins.performConfig) SDKMgr.Ins.performConfig = {};
                SDKMgr.Ins.performConfig[40003] = false;
                ok('Step1: SDKMgr.performConfig[CheckSpeed] = false');
            } else { fail('Step1: SDKMgr 不可用'); }
        } catch(e) { fail('Step1: ' + e.message); }

        // Step 2: 劫持 cc.director.getScheduler().setTimeScale
        try {
            var scheduler = cc.director.getScheduler();
            var _origSetTimeScale = scheduler.setTimeScale.bind(scheduler);
            window._aq_speed._origSetTimeScale = _origSetTimeScale;

            scheduler.setTimeScale = function(scale) {
                if (window._aq_speed.enabled) {
                    _origSetTimeScale(window._aq_speed.target);
                } else {
                    _origSetTimeScale(scale);
                }
            };
            ok('Step2: cc.director.getScheduler().setTimeScale 已劫持');
        } catch(e) {
            fail('Step2: ' + e.message);
        }

        // Step 3: 劫持 BattleFrame._setTimeSpeed
        try {
            var BattleFrame = cc.js.getClassByName('BattleFrame');
            if (BattleFrame && BattleFrame.prototype) {
                var _origSetTimeSpeed = BattleFrame.prototype._setTimeSpeed;

                BattleFrame.prototype._setTimeSpeed = function(e) {
                    var BattleModule = cc.js.getClassByName('BattleModule');
                    var PopMgr = cc.js.getClassByName('PopMgr');

                    window._aq_speed.enabled = true;
                    window._aq_speed.target = SPEED;

                    if (this._battleMain) {
                        this._battleMain.setTimeScale(SPEED);
                    }
                    if (BattleModule && BattleModule.Ins) {
                        BattleModule.Ins.setSpeedByBattleType(this._battleType, SPEED);
                    }

                    window._aq_speed._origSetTimeScale(SPEED);

                    if (PopMgr && PopMgr.Ins) {
                        PopMgr.Ins.addMidMsg('已切换至' + SPEED + '倍速');
                    }

                    if (this._speedBtn && this._speedBtn.spriteBg) {
                        this._speedBtn.spriteBg.source = 'battle/ui/common_btn_x2.png';
                    }

                    info('倍速切换: ' + SPEED + 'x (调度器已拦截)');
                };

                ok('Step3: BattleFrame._setTimeSpeed 已劫持');
            } else { fail('Step3: BattleFrame 不可用'); }
        } catch(e) { fail('Step3: ' + e.message); }

        // Step 4: 劫持 _checkSpeedBtn 绕过解锁检查
        try {
            var BattleFrame2 = cc.js.getClassByName('BattleFrame');
            if (BattleFrame2 && BattleFrame2.prototype) {
                var _origCheckSpeedBtn = BattleFrame2.prototype._checkSpeedBtn;

                BattleFrame2.prototype._checkSpeedBtn = function(e, t) {
                    if (void 0 === t && (t = !1), this._speedBtn) {
                        this._setTimeSpeed(SPEED);
                        return;
                    }
                    return _origCheckSpeedBtn.call(this, e, t);
                };
                ok('Step4: BattleFrame._checkSpeedBtn 已劫持');
            }
        } catch(e) { fail('Step4: ' + e.message); }

        // Step 5: 劫持 _onButtonSpeed
        try {
            var BattleFrame3 = cc.js.getClassByName('BattleFrame');
            if (BattleFrame3 && BattleFrame3.prototype) {
                var _origOnButtonSpeed = BattleFrame3.prototype._onButtonSpeed;

                BattleFrame3.prototype._onButtonSpeed = function(e) {
                    void 0 === e && (e = !1);
                    if (window._aq_speed.enabled) {
                        window._aq_speed.enabled = false;
                        window._aq_speed._origSetTimeScale(1);
                        if (this._battleMain) this._battleMain.setTimeScale(1);
                        var BattleModule = cc.js.getClassByName('BattleModule');
                        if (BattleModule && BattleModule.Ins) BattleModule.Ins.setSpeedByBattleType(this._battleType, 1);
                        var PopMgr = cc.js.getClassByName('PopMgr');
                        if (PopMgr && PopMgr.Ins) PopMgr.Ins.addMidMsg('已切换至1倍速');
                        if (this._speedBtn && this._speedBtn.spriteBg) this._speedBtn.spriteBg.source = 'battle/ui/common_btn_x1.png';
                        info('倍速切换: 1x');
                    } else {
                        this._setTimeSpeed(SPEED);
                    }
                };
                ok('Step5: BattleFrame._onButtonSpeed 已劫持 (1x↔' + SPEED + 'x)');
            }
        } catch(e) { fail('Step5: ' + e.message); }

        // Step 6: 监听战斗结束，自动恢复 1x
        try {
            var BattleFrame4 = cc.js.getClassByName('BattleFrame');
            if (BattleFrame4 && BattleFrame4.prototype) {
                var _origRemoveEvents = BattleFrame4.prototype.removeEvents;
                BattleFrame4.prototype.removeEvents = function() {
                    window._aq_speed.enabled = false;
                    window._aq_speed._origSetTimeScale(1);
                    info('战斗结束，恢复 1x');
                    return _origRemoveEvents.call(this);
                };
                ok('Step6: 战斗结束自动恢复 1x');
            }
        } catch(e) { fail('Step6: ' + e.message); }

        info('========================================');
        info(' 目标倍速: ' + SPEED + 'x');
        info(' 速度检测: 已绕过');
        info(' 策略: 劫持 scheduler.setTimeScale');
        info(' 切换: 点击倍速按钮 1x↔' + SPEED + 'x');
        info('========================================');
        console.warn('[AceHacker V' + V + '] ' + SPEED + '倍速 注入完成！');
        // ============================================================
        // 原脚本主体结束
        // ============================================================
    });
})();