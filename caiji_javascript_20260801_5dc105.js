// ==UserScript==
// @name         MyCocos - 排行榜玩家采集
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动采集排行榜中 fightCap 达标玩家 (iOS 专用)
// @author       Ace
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function() {
    'use strict';

    // 防止重复注入
    if (window._aq_collect_installed) return;
    window._aq_collect_installed = true;

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
                console.warn('[采集] Cocos 引擎加载超时，请确保在游戏页面运行。');
            }
        }, 500);
    }

    waitForCocos(function() {
        // ============================================================
        // 原脚本主体（几乎未改动）
        // ============================================================
        var V = '5.0';
        var THRESHOLD = 900000;
        var TARGET_MOD = 13;
        var TARGET_CMD = 32;

        console.warn('==================================================');
        console.warn('[一体化采集] v' + V + ' 注入中...');
        console.warn('[条件] fightCap >= ' + THRESHOLD);
        console.warn('==================================================');

        // 全局存储
        window._aq_collect_ctx = window._aq_collect_ctx || {};
        if (!window._aq_collect_ctx.players) {
            window._aq_collect_ctx.players = [];
            window._aq_collect_ctx.dedup = {};
        }
        var CTX = window._aq_collect_ctx;

        // 复制剪贴板
        var copyText = function(text) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); console.warn('[复制] 已复制到剪贴板'); } catch (e) {}
            document.body.removeChild(ta);
        };

        // 弹窗
        var popup = function(title, msg, dataText) {
            copyText(dataText);
            if (confirm(title + '\n\n' + msg + '\n\n[确定] 再次复制 | [取消] 关闭')) {
                copyText(dataText);
                alert('已复制!\n\n' + dataText);
            }
        };

        // 核心采集逻辑
        var processDecoded = function(decoded, modId, cmdId) {
            if (modId !== TARGET_MOD || cmdId !== TARGET_CMD) return 0;
            if (!decoded || !decoded.baseInfos) return 0;

            var baseInfos = decoded.baseInfos;
            var found = [];
            var keys = Object.keys(baseInfos);

            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (k === '_keyList' || k === '_valueList' || k === '_isReadonly' ||
                    k === '_TempSort' || k === '_keyToIndex' || k === '_isIterating' || k === '_length') {
                    continue;
                }

                var p = baseInfos[k];
                if (!p || typeof p !== 'object') continue;

                if (p.fightCap >= THRESHOLD) {
                    var uname = p.username || '?';
                    if (CTX.dedup[uname]) continue;
                    CTX.dedup[uname] = true;
                    var entry = { name: p.name || '???', username: uname };
                    found.push(entry);
                    CTX.players.push(entry);
                }
            }

            if (found.length > 0) {
                var newText = '';
                var allText = '';
                for (var j = 0; j < found.length; j++) {
                    newText += found[j].name + ' ' + found[j].username + '\n';
                }
                for (var m = 0; m < CTX.players.length; m++) {
                    allText += CTX.players[m].name + ' ' + CTX.players[m].username + '\n';
                }

                console.warn('[采集] 本次 +' + found.length + ' 人 (累计 ' + CTX.players.length + ' 人):');
                for (var n = 0; n < found.length; n++) {
                    console.warn('  ' + found[n].name + ' | ' + found[n].username);
                }

                popup(
                    '采集成功! 本次 +' + found.length + ' 人 (累计 ' + CTX.players.length + ' 人)',
                    '本次采集:\n' + newText,
                    allText
                );
            }
            return found.length;
        };

        // 手动操作函数
        window.showPlayers = function() {
            var all = CTX.players;
            if (all.length === 0) { console.warn('[结果] 暂无采集数据'); return; }
            console.warn('==================================================');
            console.warn('[采集结果] 共 ' + all.length + ' 人 (fightCap >= ' + THRESHOLD + ')');
            console.warn('==================================================');
            for (var i = 0; i < all.length; i++) {
                console.warn('  [' + (i + 1) + '] ' + all[i].name + ' ' + all[i].username);
            }
            console.warn('==================================================');
        };

        window.copyPlayers = function() {
            var all = CTX.players;
            if (all.length === 0) { console.warn('[复制] 暂无数据'); return; }
            var text = '';
            for (var i = 0; i < all.length; i++) { text += all[i].name + ' ' + all[i].username + '\n'; }
            copyText(text);
            alert('已复制 ' + all.length + ' 个玩家:\n\n' + text);
        };

        window.clearPlayers = function() {
            CTX.players = [];
            CTX.dedup = {};
            console.warn('[清空] 采集数据已重置');
        };

        // ============================================================
        // Hook 引擎
        // ============================================================

        var _aqOrig = window._aq_orig || {};
        window._aq_orig = _aqOrig;

        var restoreHooks = function(cn) {
            var C = cc.js.getClassByName(cn);
            if (!C || !C.prototype) return;
            var p = C.prototype;
            if (p._aq_hk && _aqOrig[cn + '_send']) { p.send = _aqOrig[cn + '_send']; }
            if (p._aq_hk && _aqOrig[cn + '_s2c']) { p.parserS2C = _aqOrig[cn + '_s2c']; }
            if (p._aq_hk && _aqOrig[cn + '_log']) { p.log = _aqOrig[cn + '_log']; }
            delete p._aq_hk;
        };

        var hookClass = function(cn) {
            var C = cc.js.getClassByName(cn);
            if (!C || !C.prototype) return 0;
            var p = C.prototype;
            if (p._aq_hk) return 0;
            p._aq_hk = true;
            var n = 0;

            // Hook send
            var os = _aqOrig[cn + '_send'] || p.send;
            _aqOrig[cn + '_send'] = os;
            p.send = function(m, cd, d) {
                return os.apply(this, arguments);
            };
            n++;

            // Hook parserS2C - 核心
            var op = _aqOrig[cn + '_s2c'] || p.parserS2C;
            _aqOrig[cn + '_s2c'] = op;
            p.parserS2C = function(sz, ss, md, cm, ic, b) {
                window._aq_s2c_ctx = { mod: md, cmd: cm, decodedResult: null, logData: null };
                var result = op.apply(this, arguments);
                var finalData = window._aq_s2c_ctx.logData || result;
                window._aq_s2c_ctx.decodedResult = finalData;

                // 直接采集目标协议
                processDecoded(finalData, md, cm);

                return result;
            };
            n++;

            // Hook log
            var ol = _aqOrig[cn + '_log'] || p.log;
            _aqOrig[cn + '_log'] = ol;
            p.log = function() {
                var ctx = window._aq_s2c_ctx;
                if (arguments.length >= 2) {
                    try { ctx.logData = arguments[1]; } catch (e) {}
                }
            };
            n++;

            return n;
        };

        // 执行 Hook
        restoreHooks('SocketMgr');
        restoreHooks('GameRoomSocket');
        var total = hookClass('SocketMgr') + hookClass('GameRoomSocket');

        if (total === 0) {
            console.warn('[采集] 未找到Socket类，5秒后重试...');
            setTimeout(function() {
                restoreHooks('SocketMgr');
                restoreHooks('GameRoomSocket');
                var t = hookClass('SocketMgr') + hookClass('GameRoomSocket');
                if (t === 0) {
                    console.warn('[采集] 仍未找到，请确认已进入游戏');
                } else {
                    console.warn('[采集] v' + V + ' 就绪 (' + t + ' Hook)');
                    console.warn('==================================================');
                    console.warn('[自动化] 打开排行榜 -> 自动采集 fightCap>=' + THRESHOLD);
                    console.warn('[手动] showPlayers() / copyPlayers() / clearPlayers()');
                    console.warn('==================================================');
                }
            }, 5000);
        } else {
            console.warn('[采集] v' + V + ' 就绪 (' + total + ' Hook)');
            console.warn('==================================================');
            console.warn('[自动化] 打开排行榜 -> 自动采集 fightCap>=' + THRESHOLD);
            console.warn('[手动] showPlayers() / copyPlayers() / clearPlayers()');
            console.warn('==================================================');
        }

        // ============================================================
        // 原脚本主体结束
        // ============================================================
    });

})();