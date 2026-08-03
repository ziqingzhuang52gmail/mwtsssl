// ==UserScript==
// @name         MyCocos - 核心功能解锁 (iOS 专用版)
// @namespace    http://tampermonkey.net/
// @version      4.1
// @description  强制开启 GM 模式与广告跳过 (适配 Safari Userscripts)
// @author       Assistant
// @match        *://*/*
// @grant        none
// @run-at       document-start
// @allFrames    true
// ==/UserScript==

(function() {
    'use strict';

    let hasAlerted = false;
    const TARGET_CONFIG = {
        OpenGM: 1,
        _OpenGM: 1,
        isAdvertise: 1,
        isOpenMiniGameAdvertisement: 1,
        DebugOpen: 1
    };

    const PerformType = {
        isAdvertise: 10038,
        OpenGM: 20020
    };

    // 弹窗提示函数
    function notifySuccess() {
        if (!hasAlerted) {
            alert("🚀 MyCocos 核心逻辑劫持成功！\nGM 模式与广告跳过已生效。");
            hasAlerted = true;
        }
    }

    // 核心注入逻辑
    function applyHack(TargetClass) {
        if (!TargetClass) return;

        // 劫持 AgentConfig 单例
        if (TargetClass.name === "F" || (TargetClass.Ins && TargetClass.prototype.initHost)) {
            const originalIns = Object.getOwnPropertyDescriptor(TargetClass, 'Ins');
            if (originalIns && !originalIns.set) {
                Object.defineProperty(TargetClass, 'Ins', {
                    get: function() {
                        if (!this._Ins) {
                            this._Ins = new TargetClass();
                        }
                        if (this._Ins._checkConfig) {
                            Object.assign(this._Ins._checkConfig, TARGET_CONFIG);
                            notifySuccess();
                        }
                        return this._Ins;
                    },
                    configurable: true
                });
            }
        }

        // 劫持 SDKMgr 原型
        if (TargetClass.prototype && TargetClass.prototype.getPerformConfig) {
            const proto = TargetClass.prototype;
            const rawGet = proto.getPerformConfig;
            proto.getPerformConfig = function(type, def) {
                if (type == PerformType.OpenGM || type == PerformType.isAdvertise) {
                    notifySuccess();
                    return 1;
                }
                return rawGet.apply(this, arguments);
            };
        }
    }

    // 咽喉要道劫持 (__require)
    function startHook() {
        if (window.__require && !window.__require._hooked) {
            const originalRequire = window.__require;
            window.__require = function(name) {
                let exports = originalRequire.apply(this, arguments);
                if (name === "AgentConfig" || name === "SDKMgr") {
                    applyHack(exports[name]);
                }
                return exports;
            };
            window.__require._hooked = true;
        }
    }

    // 循环探测加载器（适配 Safari 加载时序）
    const hookTimer = setInterval(() => {
        if (window.__require) {
            startHook();
            // 尝试对已加载模块补丁
            try {
                const agent = window.__require("AgentConfig");
                if (agent && agent.AgentConfig) applyHack(agent.AgentConfig);
                const sdk = window.__require("SDKMgr");
                if (sdk && sdk.SDKMgr) applyHack(sdk.SDKMgr);
            } catch(e) {}
        }
        
        // 成功后停止轮询
        if (hasAlerted) clearInterval(hookTimer);
    }, 500);

    // 10秒后自动停止探测以节省性能
    setTimeout(() => clearInterval(hookTimer), 10000);
})();