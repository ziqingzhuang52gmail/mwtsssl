// ==UserScript==
// @name         MyCocos - 一键自动购买 (iOS 极简版)
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  商店购买与活动奖励自动领取 (游戏就绪后通过弹窗触发)
// @author       Ace
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function() {
    'use strict';

    const DELAY = 500;

    // --- 临时提示系统 ---
    function showToast(msg, color = '#3498db', duration = 5000, onClick = null) {
        const toast = document.createElement('div');
        toast.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:${color};padding:12px 24px;border-radius:20px;z-index:10006;font-size:14px;font-weight:bold;text-align:center;box-shadow:0 4px 15px rgba(0,0,0,0.5);transition:opacity 0.5s ease;cursor:pointer;`;
        toast.innerHTML = msg + (onClick ? " <span style='text-decoration:underline;'>(点击执行)</span>" : " (点击关闭)");
        
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

        document.body.appendChild(toast);
        if (!onClick) {
            setTimeout(close, duration);
        }
    }

    function log(msg, color = '#fff') {
        console.log(`[AceBuy] ${msg}`);
        if (msg.includes("✨") || msg.includes("❌")) {
            showToast(msg, color === '#fff' ? '#2ecc71' : color);
        }
    }

    function checkReady() {
        const win = window;
        const socketIns = win.cc?.js?.getClassByName("SocketMgr")?.Ins;
        if (socketIns) {
            showToast("🚀 自动购买脚本已就绪", "#3498db", 10000, () => {
                log("⏳ 开始执行自动购买任务...", "#3498db");
                startTask(socketIns);
            });
        } else {
            setTimeout(checkReady, 3000);
        }
    }

    function startTask(socketIns) {
        const taskQueue = [
            { mod: 18, cmd: 13, data: { code: 4, jsonArgs: '{"code":1002}' }, desc: "活动奖励" },
            { mod: 18, cmd: 16, data: { code: 72, jsonArgs: '{"code":1001}' }, desc: "操作 72" },
            { mod: 16, cmd: 3, data: { type: 3, id: 3020001, num: 1, grid: 2 }, desc: "商店购买" },
            { mod: 18, cmd: 16, data: { code: 100, jsonArgs: '{}' }, desc: "操作 100" }
        ];

        for (let i = 0; i < 6; i++) {
            taskQueue.push({ mod: 18, cmd: 16, data: { code: 1000102, jsonArgs: '{"type":3}' }, desc: "循环操作" });
        }

        const shopItems = [
            { type: 17, id: 17060001, num: 1, grid: 6 },
            { type: 17, id: 17070001, num: 1, grid: 7 },
            { type: 17, id: 17050001, num: 3, grid: 5 },
            { type: 17, id: 17040001, num: 3, grid: 4 },
            { type: 19, id: 19080001, num: 5, grid: 8 },
            { type: 19, id: 19070001, num: 5, grid: 7 },
            { type: 19, id: 19060001, num: 10, grid: 6 },
            { type: 19, id: 19050001, num: 10, grid: 5 },
            { type: 19, id: 19040001, num: 10, grid: 4 }
        ];
        shopItems.forEach(item => taskQueue.push({ mod: 16, cmd: 3, data: item, desc: "购买:" + item.id }));

        let idx = 0;
        const run = () => {
            if (idx >= taskQueue.length) {
                log("✨ 所有购买任务已完成！", "#2ecc71");
                return;
            }
            const task = taskQueue[idx++];
            socketIns.send(task.mod, task.cmd, task.data || {});
            setTimeout(run, DELAY);
        };
        run();
    }

    // 启动检查
    setTimeout(checkReady, 5000);
})();
