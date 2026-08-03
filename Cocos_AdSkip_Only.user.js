// ==UserScript==
// @name         MyCocos - 仅广告跳过
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  仅强制开启广告跳过，关闭 GM 模式
// @author       Assistant
// @match        *://*/*
// @grant        none
// @run-at       document-start
// @allFrames    true
// ==/UserScript==

(function() {
    'use strict';
    let hasAlerted = false;
    // 注意：此处 OpenGM 设为 0
    const TARGET_CONFIG = { OpenGM: 0, _OpenGM: 0, isAdvertise: 1, isOpenMiniGameAdvertisement: 1, DebugOpen: 0 };
    const PerformType = { isAdvertise: 10038, OpenGM: 20020 };

    function notify(msg) {
        if (!hasAlerted) { alert(msg); hasAlerted = true; }
    }

    function applyHack(TargetClass) {
        if (!TargetClass) return;
        if (TargetClass.name === "F" || (TargetClass.Ins && TargetClass.prototype.initHost)) {
            const originalIns = Object.getOwnPropertyDescriptor(TargetClass, 'Ins');
            if (originalIns && !originalIns.set) {
                Object.defineProperty(TargetClass, 'Ins', {
                    get: function() {
                        if (!this._Ins) this._Ins = new TargetClass();
                        if (this._Ins._checkConfig) { Object.assign(this._Ins._checkConfig, TARGET_CONFIG); notify("📺 广告跳过注入成功！(GM已关闭)"); }
                        return this._Ins;
                    }, configurable: true
                });
            }
        }
        if (TargetClass.prototype && TargetClass.prototype.getPerformConfig) {
            const proto = TargetClass.prototype;
            const rawGet = proto.getPerformConfig;
            proto.getPerformConfig = function(type, def) {
                if (type == PerformType.isAdvertise) return 1;
                if (type == PerformType.OpenGM) return 0; // 强制关闭 GM
                return rawGet.apply(this, arguments);
            };
        }
    }

    const hookTimer = setInterval(() => {
        if (window.__require) {
            if (!window.__require._hooked) {
                const originalRequire = window.__require;
                window.__require = function(name) {
                    let exports = originalRequire.apply(this, arguments);
                    if (name === "AgentConfig" || name === "SDKMgr") applyHack(exports[name]);
                    return exports;
                };
                window.__require._hooked = true;
            }
            try {
                const agent = window.__require("AgentConfig"); if (agent) applyHack(agent.AgentConfig);
                const sdk = window.__require("SDKMgr"); if (sdk) applyHack(sdk.SDKMgr);
            } catch(e) {}
        }
        if (hasAlerted) clearInterval(hookTimer);
    }, 500);
    setTimeout(() => clearInterval(hookTimer), 10000);
})();