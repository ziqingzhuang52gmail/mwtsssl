// ==UserScript==
// @name         MyCocos - 战斗必胜 (iOS 极简版)
// @namespace    https://viayoo.com/mf8b4q
// @version      1.6
// @description  竞技场与矿产秒杀 (自动激活，无挡屏浮窗)
// @author       Ace
// @run-at       document-end
// @match        *://cdn.ygjsz3.com:5566/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isEnabled = true;
    const TARGET_MODES = { ARENA: 5, MINING: 27 };
    const AUTH_LIST = [
        "18726481813", // 用户当前账号
        "315905",      // 兼容字符串形式
        315905
    ];

    // --- 临时提示系统 ---
    function showToast(msg, color = '#2ecc71', duration = 3000) {
        if (!document.body) return; // 容错处理
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;top:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:${color};padding:12px 24px;border-radius:20px;z-index:99999;font-size:14px;font-weight:bold;text-align:center;box-shadow:0 4px 15px rgba(0,0,0,0.5);transition:opacity 0.5s ease;cursor:pointer;`;
        toast.innerText = msg + " (点击关闭)";
        toast.onclick = () => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); };
        document.body.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 500);
            }
        }, duration);
    }

    function log(msg, color = '#fff') {
        console.log(`[AceBattle] ${msg}`);
        // 增加对身份验证状态的提示
        if (msg.includes("🎯") || msg.includes("✅") || msg.includes("🚫") || msg.includes("🔑")) {
            showToast(msg, color === '#fff' ? '#f1c40f' : color);
        }
    }

    const getRawModule = (name) => {
        const win = window;
        // 增加对不同加载器的深度兼容
        const req = win.__require || win.require || (win.cc && win.cc.require);
        if (typeof req !== "function") return null;
        try { 
            const mod = req(name); 
            if (mod) return mod;
        } catch (e) {}
        
        try { 
            const baseName = name.split('/').pop();
            return req(baseName); 
        } catch (e2) {}
        
        return null;
    };

    let retryCount = 0;
    const inject = () => {
        const win = window;
        if (!win.cc || !win.cc.js) {
            retryCount++;
            if (retryCount < 100) setTimeout(inject, 1000); // 增加重试次数
            return;
        }

        const BattleVoMod = getRawModule("BattleVo") || win.cc.js.getClassByName('BattleVo');
        const BattleProtoMod = getRawModule("BattleProto");
        const PlayerMod = getRawModule("PlayerModule");

        if (!BattleVoMod || !PlayerMod || !PlayerMod.Ins || !PlayerMod.Ins.playerInfo) {
            setTimeout(inject, 2000);
            return;
        }

        // --- 身份验证逻辑 ---
        const playerIns = PlayerMod.Ins;
        const info = playerIns.playerInfo?.info || playerIns.playerInfo || {};
        const currentPlayerId = playerIns.playerId;
        const currentUsername = info.username || info.name || "";

        // 记录当前用户信息，方便调试
        console.log(`[AceBattle] 正在验证身份: UID=${currentPlayerId}, Username=${currentUsername}`);

        const isAuthorized = AUTH_LIST.some(auth => 
            String(auth) === String(currentPlayerId) || String(auth) === String(currentUsername)
        );

        if (!isAuthorized) {
            log(`🚫 未授权用户: ${currentUsername}(${currentPlayerId})`, "#e74c3c");
            return; 
        }

        log(`🔑 身份验证成功: ${currentUsername}`, "#2ecc71");

        const BattleVoClass = BattleVoMod.BattleVo || (typeof BattleVoMod === 'function' ? BattleVoMod : null);
        if (BattleVoClass && !BattleVoClass.__isHijacked) {
            const OriginalBattleVo = BattleVoClass;
            const WinResult = BattleProtoMod?.EBattleResult_Battle_Enum?.EBattleResultWin || 1;

            const HijackedBattleVo = function(req, s2c) {
                const instance = new OriginalBattleVo(req, s2c);
                // 兼容性判断：竞技场(5), 矿产(27), 尝试增加通用判断
                const isTargetMode = instance.battleType === TARGET_MODES.ARENA || instance.battleType === TARGET_MODES.MINING;

                if (isEnabled && !instance._isReplay && isTargetMode) {
                    log(`🎯 秒杀已生效! 类型:${instance.battleType}`, "#f1c40f");
                    instance.isCrush = true;
                    instance.result = WinResult;
                }
                return instance;
            };

            HijackedBattleVo.prototype = OriginalBattleVo.prototype;
            BattleVoClass.__isHijacked = true;
            
            // 劫持赋值
            if (BattleVoMod.BattleVo) {
                BattleVoMod.BattleVo = HijackedBattleVo;
            } else {
                win.BattleVo = HijackedBattleVo;
            }
            
            log("✅ 战斗必胜模块已就绪", "#2ecc71");
        }
    };
 
     // 启动流程
     inject();
 })();
