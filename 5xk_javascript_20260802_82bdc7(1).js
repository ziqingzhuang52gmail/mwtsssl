// ==UserScript==
// @name         MyCocos - 战斗倍速 (5倍速防断线)
// @namespace    http://tampermonkey.net/
// @version      9.2
// @description  劫持调度器实现5倍速，并拦截提前结束防止断线 (iOS 专用)
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
        // 原脚本主体（V9.2 防断线版）
        // ============================================================
        var V = "9.2";

        // ★★★ 修改这里切换倍速 ★★★
        var SPEED = 4.5;

        var TAG = '[AceHacker]';
        function ok(msg)  { console.warn(TAG + ' ✓ ' + msg); }
        function fail(msg){ console.warn(TAG + ' ✗ ' + msg); }
        function info(msg){ console.warn(TAG + ' ℹ ' + msg); }
        function warn(msg){ console.warn(TAG + ' ⚠ ' + msg); }

        console.warn('[AceHacker V' + V + '] ' + SPEED + '倍速(防断线) 注入中...');
        window._aq_speed = window._aq_speed || {};
        window._aq_speed.target = SPEED;
        window._aq_speed.enabled = false;
        window._aq_speed._prematureEndSuppressed = false;
        window._aq_speed._pendingResult = null;

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
            ok('Step2: scheduler.setTimeScale 已劫持');
        } catch(e) {
            fail('Step2: ' + e.message);
        }

        // Step 3: 劫持 BattleFrame — 倍速切换 + 防断线核心
        try {
            var BattleFrame = cc.js.getClassByName('BattleFrame');
            if (!BattleFrame || !BattleFrame.prototype) {
                fail('Step3: BattleFrame 不可用');
                throw new Error('BattleFrame not found');
            }

            // 3a: 劫持 _setTimeSpeed
            var _origSetTimeSpeed = BattleFrame.prototype._setTimeSpeed;
            BattleFrame.prototype._setTimeSpeed = function(e) {
                var BattleModule = cc.js.getClassByName('BattleModule');
                var PopMgr = cc.js.getClassByName('PopMgr');

                window._aq_speed.enabled = true;
                window._aq_speed.target = SPEED;
                window._aq_speed._prematureEndSuppressed = false;

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
                info('倍速切换: ' + SPEED + 'x');
            };
            ok('Step3a: _setTimeSpeed 已劫持');

            // 3b: 劫持 _checkSpeedBtn
            var _origCheckSpeedBtn = BattleFrame.prototype._checkSpeedBtn;
            BattleFrame.prototype._checkSpeedBtn = function(e, t) {
                if (void 0 === t && (t = !1), this._speedBtn) {
                    this._setTimeSpeed(SPEED);
                    return;
                }
                return _origCheckSpeedBtn.call(this, e, t);
            };
            ok('Step3b: _checkSpeedBtn 已劫持');

            // 3c: 劫持 _onButtonSpeed
            var _origOnButtonSpeed = BattleFrame.prototype._onButtonSpeed;
            BattleFrame.prototype._onButtonSpeed = function(e) {
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
            ok('Step3c: _onButtonSpeed 已劫持');

            // ★★★ 3d: 核心修复 — 劫持 playBattlePreEnd 防止提前断线 ★★★
            var _origPlayBattlePreEnd = BattleFrame.prototype.playBattlePreEnd;
            BattleFrame.prototype.playBattlePreEnd = function(e) {
                if (window._aq_speed.enabled) {
                    var delegateServer = this._delegateServer;
                    if (delegateServer) {
                        var engineTick = this._battleMain && this._battleMain._engineDelegate
                            ? this._battleMain._engineDelegate.currentTick : 0;
                        var expectedTick = delegateServer._expected_tick || 0;
                        var serverTick = delegateServer.currentTick || 0;

                        if (engineTick > 0 && expectedTick > 0 && engineTick < expectedTick - 50) {
                            window._aq_speed._prematureEndSuppressed = true;
                            window._aq_speed._pendingResult = e;
                            warn('拦截提前结束: engineTick=' + engineTick + ' < expectedTick=' + expectedTick + ' (差值=' + (expectedTick - engineTick) + ')');
                            return;
                        }
                    }
                    info('战斗正常结束，放行 playBattlePreEnd');
                    window._aq_speed._prematureEndSuppressed = false;
                }
                return _origPlayBattlePreEnd.call(this, e);
            };
            ok('Step3d: playBattlePreEnd 已劫持(防断线)');

            // 3e: 劫持 removeEvents — 战斗结束自动恢复
            var _origRemoveEvents = BattleFrame.prototype.removeEvents;
            BattleFrame.prototype.removeEvents = function() {
                window._aq_speed.enabled = false;
                window._aq_speed._origSetTimeScale(1);
                window._aq_speed._prematureEndSuppressed = false;
                info('战斗结束，恢复 1x');
                return _origRemoveEvents.call(this);
            };
            ok('Step3e: removeEvents 已劫持');

        } catch(e) {
            fail('Step3: ' + e.message);
        }

        // Step 4: 已移除 EngineStateChangedParser.afterTick 拦截
        // 原因：该拦截无条件阻止所有 FINISHED(state===3) 事件，
        // 导致第二局开始加载时引擎状态过渡被阻断，卡在加载页面。
        // playBattlePreEnd 拦截(Step3d) 已基于 tick 差值精确处理，无需额外防线。

        info('========================================');
        info(' 目标倍速: ' + SPEED + 'x');
        info(' 防断线: playBattlePreEnd 拦截(基于tick差值)');
        info(' 切换: 点击倍速按钮 1x↔' + SPEED + 'x');
        info('========================================');
        console.warn('[AceHacker V' + V + '] ' + SPEED + '倍速(防断线) 注入完成！');
        // ============================================================
        // 原脚本主体结束
        // ============================================================
    });
})();