// ==UserScript==
// @name         MyCocos - 战斗倍速 V11.0 (SocketMgr拦截)
// @namespace    http://tampermonkey.net/
// @version      11.0
// @description  方案E: Hook SocketMgr.send拦截QuitRoom(82,4)补偿endFrame/totalTime/operFrame + UIMgr拦截速度弹窗 + SocketMgr.close防断连
// @author       Ace
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function() {
    'use strict';

    if (window._aq_speed_installed) return;
    window._aq_speed_installed = true;

    function showToast(msg, color, duration) {
        color = color || '#00ffff';
        duration = duration || 5000;
        var toast = document.createElement('div');
        toast.style.cssText = 'position:fixed;top:12%;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.92);color:' + color + ';padding:16px 24px;border-radius:14px;z-index:9999999;font-size:15px;font-weight:bold;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.7);transition:all 0.4s ease;width:78%;max-width:340px;border:1px solid ' + color + ';line-height:1.6;pointer-events:none;';
        toast.innerHTML = msg;
        (document.body || document.documentElement).appendChild(toast);
        setTimeout(function() {
            if (toast.parentNode) {
                toast.style.opacity = '0';
                setTimeout(function() { toast.remove(); }, 500);
            }
        }, duration);
    }

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
                console.warn('[AceHacker] Cocos 引擎加载超时');
            }
        }, 500);
    }

    waitForCocos(function() {
        var V = "11.0";
        var DEFAULT_SPEED = 5;
        var SPEED = DEFAULT_SPEED;

        // BuildProxy模块ID=82, BuildWorldProxy模块ID=93, QuitRoom命令=4
        var MODULE_BUILD_PROXY = 82;
        var MODULE_BUILD_WORLD_PROXY = 93;
        var CMD_QUIT_ROOM = 4;
        var TICK_INTERVAL_IN_SEC = 10;

        var TAG = '[AceHacker]';
        function ok(msg)  { console.warn(TAG + ' [OK] ' + msg); }
        function fail(msg){ console.warn(TAG + ' [FAIL] ' + msg); }
        function info(msg){ console.warn(TAG + ' [INFO] ' + msg); }
        function warn(msg){ console.warn(TAG + ' [WARN] ' + msg); }

        showToast('战斗倍速系统已就绪 (方案E-SocketMgr拦截)', '#00ffff', 3000);
        setTimeout(function() {
            var input = prompt('请输入目标倍速值 (推荐 3~10):', DEFAULT_SPEED);
            if (input === null) {
                SPEED = DEFAULT_SPEED;
                showToast('已取消，使用默认倍速: ' + DEFAULT_SPEED + 'x', '#ffaa00', 3000);
            } else {
                var val = parseFloat(input);
                if (isNaN(val) || val <= 0 || val > 50) {
                    SPEED = DEFAULT_SPEED;
                    showToast('输入无效，使用默认倍速: ' + DEFAULT_SPEED + 'x', '#ff6600', 3000);
                } else {
                    SPEED = val;
                    showToast('倍速已设置: ' + SPEED + 'x', '#00ff00', 3000);
                }
            }
            startHooks();
        }, 500);

        function startHooks() {
        console.warn('[AceHacker V' + V + '] ' + SPEED + '倍速(方案E-SocketMgr拦截) 注入中...');
        window._aq_speed = window._aq_speed || {};
        window._aq_speed.target = SPEED;
        window._aq_speed.enabled = false;
        window._aq_speed._battleStartTime = 0;
        window._aq_speed._blockClose = false; // 速度检测触发时阻断SocketMgr.close

        // ============================================================
        // ★★★ Step 1: Hook SocketMgr.prototype.send — 核心补偿 ★★★
        //   拦截QuitRoom请求(module=82/93, cmd=4)，补偿endFrame/totalTime/operFrame
        //
        //   根因: V10.0使用cc.js.getClassByName('TDServerProxy')获取类，
        //   但TDServerProxy未注册到cc.js → 返回null → 补偿Hook从未安装!
        //
        //   修复: 改为Hook SocketMgr.prototype.send(已验证可访问)
        //   SocketMgr.send(moduleId, cmdId, data, callbacks)
        //   QuitRoom: moduleId=82(BuildProxy)或93(BuildWorldProxy), cmdId=4
        //   data包含: {battleType, type, extra, endFrame, totalTime, operations}
        // ============================================================
        try {
            var SocketMgr = cc.js.getClassByName('SocketMgr');
            if (!SocketMgr || !SocketMgr.prototype || !SocketMgr.prototype.send) {
                fail('Step1: SocketMgr 不可用');
                throw new Error('SocketMgr not found');
            }

            var _origSend = SocketMgr.prototype.send;

            SocketMgr.prototype.send = function(moduleId, cmdId, data, callbacks) {
                // 检测QuitRoom请求
                if ((moduleId === MODULE_BUILD_PROXY || moduleId === MODULE_BUILD_WORLD_PROXY)
                    && cmdId === CMD_QUIT_ROOM
                    && data && data.endFrame != null) {

                    if (window._aq_speed.target > 1) {
                        var scale = window._aq_speed.target;
                        var rawEndFrame = data.endFrame;
                        var rawTotalTime = data.totalTime;

                        // 补偿endFrame: ÷SPEED
                        data.endFrame = Math.floor(rawEndFrame / scale);

                        // 重新计算totalTime = endFrame / TICK_INTERVAL_IN_SEC
                        if (data.totalTime != null) {
                            data.totalTime = Math.floor(data.endFrame / TICK_INTERVAL_IN_SEC);
                        }

                        // 补偿操作记录 operFrame: ÷SPEED
                        var opCount = 0;
                        if (data.operations) {
                            var ops = data.operations;
                            // Cocos List对象有getValues()方法
                            if (typeof ops.getValues === 'function') {
                                var values = ops.getValues();
                                for (var i = 0; i < values.length; i++) {
                                    var op = values[i];
                                    if (op && op.operFrame != null && op.operFrame > 0) {
                                        op.operFrame = Math.floor(op.operFrame / scale);
                                        opCount++;
                                    }
                                }
                            } else if (Array.isArray(ops)) {
                                for (var j = 0; j < ops.length; j++) {
                                    var opA = ops[j];
                                    if (opA && opA.operFrame != null && opA.operFrame > 0) {
                                        opA.operFrame = Math.floor(opA.operFrame / scale);
                                        opCount++;
                                    }
                                }
                            }
                        }

                        var realElapsed = 0;
                        if (window._aq_speed._battleStartTime > 0) {
                            realElapsed = Math.floor((Date.now() - window._aq_speed._battleStartTime) / 1000);
                        }

                        warn('==================== 退房时间补偿 ====================');
                        warn('module=' + moduleId + ' cmd=' + cmdId + ' (QuitRoom)');
                        warn('endFrame: ' + rawEndFrame + ' -> ' + data.endFrame + ' (/' + scale + ')');
                        warn('totalTime: ' + rawTotalTime + ' -> ' + data.totalTime + ' (endFrame/' + TICK_INTERVAL_IN_SEC + ')');
                        warn('operations: ' + opCount + '条 operFrame已补偿 (/' + scale + ')');
                        warn('真实经过: ' + realElapsed + 's, 补偿totalTime: ' + data.totalTime + 's');
                        warn('======================================================');
                    } else {
                        info('QuitRoom请求放行(未加速): endFrame=' + data.endFrame + ', totalTime=' + data.totalTime);
                    }
                }

                return _origSend.apply(this, arguments);
            };

            ok('Step1: SocketMgr.send 已劫持(QuitRoom补偿 module=82/93 cmd=4)');
        } catch(e) {
            fail('Step1: ' + e.message);
        }

        // ============================================================
        // ★★★ Step 2: Hook UIMgr.prototype.open — 拦截速度异常弹窗 ★★★
        //   GameMgr._checkCheat触发时:
        //     1. 调用UIMgr.Ins.open(CommonTipsDialog, ..., {commonTips:"检查到速度异常..."})
        //     2. 调用SocketMgr.Ins.close()断开连接
        //
        //   V10.0尝试劫持GameMgr._checkCheat，但cc.js.getClassByName('GameMgr')返回null
        //   修复: 改为拦截弹窗显示 + 阻断SocketMgr.close
        // ============================================================
        try {
            var UIMgr = cc.js.getClassByName('UIMgr');
            if (!UIMgr || !UIMgr.prototype || !UIMgr.prototype.open) {
                fail('Step2: UIMgr 不可用');
                throw new Error('UIMgr not found');
            }

            var _origOpen = UIMgr.prototype.open;

            UIMgr.prototype.open = function(view, layerType, data) {
                // 检测"检查到速度异常，已断开连接"弹窗
                if (data && data.commonTips) {
                    var tips = String(data.commonTips);
                    if (tips.indexOf('速度异常') >= 0 || tips.indexOf('\u901f\u5ea6\u5f02\u5e38') >= 0) {
                        warn('Step2: 拦截速度异常弹窗: ' + tips);
                        warn('Step2: 设置_blockClose=true 阻断即将到来的SocketMgr.close()');
                        // 设置标记，阻断接下来的SocketMgr.close()
                        window._aq_speed._blockClose = true;
                        // 1秒后清除标记，避免影响正常关闭
                        setTimeout(function() {
                            window._aq_speed._blockClose = false;
                        }, 1000);
                        // 返回null阻止弹窗显示
                        return null;
                    }
                }
                return _origOpen.apply(this, arguments);
            };

            ok('Step2: UIMgr.open 已劫持(拦截速度异常弹窗)');
        } catch(e) {
            fail('Step2: ' + e.message);
        }

        // ============================================================
        // ★★★ Step 3: Hook SocketMgr.prototype.close — 防断连 ★★★
        //   _checkCheat触发后会调用SocketMgr.Ins.close()断开连接
        //   当_blockClose=true时阻断close，保持连接
        // ============================================================
        try {
            var SocketMgr2 = cc.js.getClassByName('SocketMgr');
            if (SocketMgr2 && SocketMgr2.prototype && SocketMgr2.prototype.close) {
                var _origClose = SocketMgr2.prototype.close;

                SocketMgr2.prototype.close = function() {
                    if (window._aq_speed._blockClose) {
                        warn('Step3: 阻断SocketMgr.close() (速度检测触发，保持连接)');
                        return;
                    }
                    return _origClose.apply(this, arguments);
                };

                ok('Step3: SocketMgr.close 已劫持(防速度检测断连)');
            } else {
                fail('Step3: SocketMgr.close 不可用');
            }
        } catch(e) {
            fail('Step3: ' + e.message);
        }

        // ============================================================
        // Step 4: Hook cc.director.getScheduler().setTimeScale
        // ============================================================
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
            ok('Step4: scheduler.setTimeScale 已劫持');
        } catch(e) {
            fail('Step4: ' + e.message);
        }

        // ============================================================
        // Step 5: Hook BattleFrame — 倍速切换
        // ============================================================
        try {
            var BattleFrame = cc.js.getClassByName('BattleFrame');
            if (!BattleFrame || !BattleFrame.prototype) {
                fail('Step5: BattleFrame 不可用');
                throw new Error('BattleFrame not found');
            }

            var _origSetTimeSpeed = BattleFrame.prototype._setTimeSpeed;
            BattleFrame.prototype._setTimeSpeed = function(e) {
                var BattleModule = cc.js.getClassByName('BattleModule');
                var PopMgr = cc.js.getClassByName('PopMgr');

                if (!window._aq_speed.enabled) {
                    window._aq_speed._battleStartTime = Date.now();
                }

                window._aq_speed.enabled = true;
                window._aq_speed.target = SPEED;

                if (this._battleMain) {
                    this._battleMain.setTimeScale(SPEED);
                }
                if (BattleModule && BattleModule.Ins) {
                    BattleModule.Ins.setSpeedByBattleType(this._battleType, SPEED);
                }
                window._aq_speed._origSetTimeScale(SPEED);

                info('倍速切换: ' + SPEED + 'x');
            };
            ok('Step5a: _setTimeSpeed 已劫持');

            var _origCheckSpeedBtn = BattleFrame.prototype._checkSpeedBtn;
            BattleFrame.prototype._checkSpeedBtn = function(e, t) {
                if (void 0 === t && (t = !1), this._speedBtn) {
                    this._setTimeSpeed(SPEED);
                    return;
                }
                return _origCheckSpeedBtn.call(this, e, t);
            };
            ok('Step5b: _checkSpeedBtn 已劫持');

            var _origOnButtonSpeed = BattleFrame.prototype._onButtonSpeed;
            BattleFrame.prototype._onButtonSpeed = function(e) {
                void 0 === e && (e = !1);
                if (window._aq_speed.enabled) {
                    window._aq_speed.enabled = false;
                    window._aq_speed._origSetTimeScale(1);
                    if (this._battleMain) this._battleMain.setTimeScale(1);
                    var BattleModule = cc.js.getClassByName('BattleModule');
                    if (BattleModule && BattleModule.Ins) BattleModule.Ins.setSpeedByBattleType(this._battleType, 1);
                    info('倍速切换: 1x');
                } else {
                    this._setTimeSpeed(SPEED);
                }
            };
            ok('Step5c: _onButtonSpeed 已劫持');

            var _origPlayBattlePreEnd = BattleFrame.prototype.playBattlePreEnd;
            BattleFrame.prototype.playBattlePreEnd = function(e) {
                if (window._aq_speed.enabled) {
                    var delegateServer = this._delegateServer;
                    if (delegateServer) {
                        var engineTick = this._battleMain && this._battleMain._engineDelegate
                            ? this._battleMain._engineDelegate.currentTick : 0;
                        var expectedTick = delegateServer._expected_tick || 0;
                        if (engineTick > 0 && expectedTick > 0 && engineTick < expectedTick - 50) {
                            warn('拦截提前结束: engineTick=' + engineTick + ' < expectedTick=' + expectedTick);
                            return;
                        }
                    }
                    info('战斗正常结束，放行');
                }
                return _origPlayBattlePreEnd.call(this, e);
            };
            ok('Step5d: playBattlePreEnd 已劫持');

            var _origRemoveEvents = BattleFrame.prototype.removeEvents;
            BattleFrame.prototype.removeEvents = function() {
                window._aq_speed.enabled = false;
                window._aq_speed._origSetTimeScale(1);
                info('战斗结束，恢复 1x');
                return _origRemoveEvents.call(this);
            };
            ok('Step5e: removeEvents 已劫持');

        } catch(e) {
            fail('Step5: ' + e.message);
        }

        // ============================================================
        // Step 6: EngineStateChangedParser 拦截 (备用)
        // ============================================================
        try {
            var EngineStateChangedParser = cc.js.getClassByName('EngineStateChangedParser');
            if (EngineStateChangedParser && EngineStateChangedParser.prototype) {
                var _origAfterTick = EngineStateChangedParser.prototype.afterTick;
                EngineStateChangedParser.prototype.afterTick = function(t, o) {
                    if (window._aq_speed.enabled && o && o.state === 3) {
                        warn('EngineStateChangedParser 拦截 FINISHED');
                        return;
                    }
                    return _origAfterTick.call(this, t, o);
                };
                ok('Step6: EngineStateChangedParser 已劫持');
            }
        } catch(e) {
            warn('Step6: ' + e.message);
        }

        // ============================================================
        // ★★★ Step 7: 网络请求监控 — 验证补偿是否执行 ★★★
        //   拦截XMLHttpRequest监控QuitRoomRResponse中的错误码
        // ============================================================
        try {
            var _origXHROpen = XMLHttpRequest.prototype.open;
            var _origXHRSend = XMLHttpRequest.prototype.send;

            XMLHttpRequest.prototype.open = function(method, url) {
                this._aq_url = url;
                this._aq_method = method;
                return _origXHROpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.send = function(body) {
                var self = this;
                var origOnLoad = this.onload;
                this.onload = function() {
                    if (self._aq_url && self._aq_url.indexOf('QuitRoom') >= 0) {
                        warn('XHR QuitRoom响应: status=' + self.status + ' body=' + (self.responseText || '').substring(0, 200));
                    }
                    // 检测错误码10000361
                    if (self.responseText && self.responseText.indexOf('10000361') >= 0) {
                        fail('检测到服务端错误码10000361! 补偿可能未生效');
                        fail('响应内容: ' + self.responseText.substring(0, 500));
                    }
                    if (origOnLoad) origOnLoad.apply(self, arguments);
                };
                return _origXHRSend.apply(this, arguments);
            };

            ok('Step7: XMLHttpRequest 监控已启动(检测10000361)');
        } catch(e) {
            warn('Step7: ' + e.message);
        }

        info('========================================');
        info(' 方案E: SocketMgr拦截模式');
        info(' 目标倍速: ' + SPEED + 'x');
        info('');
        info(' 客户端检测: UIMgr拦截弹窗 + SocketMgr.close防断连');
        info(' 服务端检测: SocketMgr.send拦截QuitRoom(82,4)');
        info('              endFrame÷' + SPEED + ' + totalTime重算 + operFrame÷' + SPEED);
        info('');
        info(' 切换: 点击倍速按钮 1x↔' + SPEED + 'x');
        info(' 验证: 退房时查看控制台"退房时间补偿"日志');
        info('========================================');
        console.warn('[AceHacker V' + V + '] ' + SPEED + '倍速(方案E-SocketMgr拦截) 注入完成！');
        }
    });
})();
