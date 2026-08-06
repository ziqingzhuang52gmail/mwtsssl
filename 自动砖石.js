// ============================================================
// 阿庆定时发包 v2.0 — 修复原生 API 冲突
// v1.0 严重缺陷：setInterval/stop/status 覆写原生 API，
//   游戏调用 setInterval(fn,ms) 时 cfg.intervalSec 被赋值为函数，
//   randJitter 返回 NaN，setTimeout(doSend,NaN) 立即触发，
//   导致全部剩余包瞬间并发。
// v2.0 修复：所有指令加 aq 前缀，randJitter 加类型防护。
//
// 用法：
//   aqStart()               开始定时发包
//   aqStop()                停止
//   aqStatus()              查看状态
//   aqSetCmd(mod, cmd, data) 修改发包命令
//   aqSetGap(8)             修改间隔秒数
//   aqSetBatch(15)          修改每批量
//   aqSetPause(20)          修改暂停秒数
//   aqSetJitter(0.2)        修改抖动比例
// ============================================================
(function(){
  if(window._aq_auto_send){
    console.info('[定时发包] 已注入，跳过');
    return;
  }
  window._aq_auto_send = true;
  var out = console.info.bind(console);

  // ── 配置（可运行时修改）──
  var cfg = {
    mod: 11,
    cmd: 39,
    data: { code: '0' },
    intervalSec: 3,    // 正常间隔秒数
    batchCount: 30,    // 每批发送次数
    pauseSec: 12,      // 批次间暂停秒数
    jitter: 0.3,       // 抖动比例 0~1（0.3=±30%随机偏移）
  };

  // ── 状态 ──
  var running = false;
  var sentCount = 0;       // 总发送数
  var batchSent = 0;       // 当前批次已发数
  var timerId = null;
  var phase = 'idle';      // idle | sending | pausing

  // ── 随机抖动间隔（带类型防护）──
  function randJitter(baseSec){
    if(typeof baseSec !== 'number' || !isFinite(baseSec) || baseSec <= 0){
      return 6; // 防护：非法值回退到默认6秒
    }
    var j = cfg.jitter;
    if(typeof j !== 'number' || j <= 0) return baseSec;
    var offset = baseSec * j * (Math.random() * 2 - 1); // ±j%
    return Math.max(1, baseSec + offset);
  }

  // ── 执行一次发包 ──
  function doSend(){
    if(!running) return;
    try{
      var ok = window.go(cfg.mod, cfg.cmd, cfg.data);
      if(ok){
        sentCount++;
        batchSent++;
        out('✅ [定时发包] #' + sentCount + ' (批次 ' + batchSent + '/' + cfg.batchCount + ') go(' + cfg.mod + ',' + cfg.cmd + ',' + JSON.stringify(cfg.data) + ')');
      } else {
        out('❌ [定时发包] 发包失败，停止');
        aqStop();
        return;
      }
    }catch(e){
      out('❌ [定时发包] 异常: ' + e.message);
      aqStop();
      return;
    }

    // 判断下一步
    if(batchSent >= cfg.batchCount){
      // 进入暂停
      phase = 'pausing';
      var pauseTime = randJitter(cfg.pauseSec);
      out('⏸ [定时发包] 批次完成，暂停 ' + pauseTime.toFixed(1) + ' 秒...');
      timerId = setTimeout(function(){
        batchSent = 0;
        phase = 'sending';
        scheduleNext();
      }, pauseTime * 1000);
    } else {
      scheduleNext();
    }
  }

  // ── 安排下一次发包 ──
  function scheduleNext(){
    if(!running) return;
    var wait = randJitter(cfg.intervalSec);
    timerId = setTimeout(doSend, wait * 1000);
  }

  // ── 指令（全部加 aq 前缀，避免覆写原生 API）──
  window.aqStart = function(){
    if(running){
      out('[定时发包] 已在运行中');
      return;
    }
    running = true;
    batchSent = 0;
    phase = 'sending';
    out('[定时发包] 开始 go(' + cfg.mod + ',' + cfg.cmd + ',' + JSON.stringify(cfg.data) + ')');
    out('  间隔 ' + cfg.intervalSec + 's | 每' + cfg.batchCount + '次暂停 ' + cfg.pauseSec + 's | 抖动 ±' + (cfg.jitter*100) + '%');
    doSend();
  };

  window.aqStop = function(){
    running = false;
    if(timerId){ clearTimeout(timerId); timerId = null; }
    phase = 'idle';
    out('[定时发包] 已停止 (累计发送 ' + sentCount + ' 次)');
  };

  window.aqStatus = function(){
    out('[定时发包]');
    out('  状态: ' + (running ? '运行中(' + phase + ')' : '已停止'));
    out('  命令: go(' + cfg.mod + ', ' + cfg.cmd + ', ' + JSON.stringify(cfg.data) + ')');
    out('  间隔: ' + cfg.intervalSec + 's | 批次: ' + batchSent + '/' + cfg.batchCount + ' | 暂停: ' + cfg.pauseSec + 's');
    out('  抖动: ±' + (cfg.jitter*100) + '% | 累计: ' + sentCount + ' 次');
  };

  window.aqSetCmd = function(mod, cmd, data){
    cfg.mod = mod;
    cfg.cmd = cmd;
    cfg.data = data;
    out('[定时发包] 命令已修改: go(' + mod + ', ' + cmd + ', ' + JSON.stringify(data) + ')');
  };

  window.aqSetGap = function(sec){
    if(typeof sec !== 'number' || sec <= 0){
      out('[定时发包] ❌ 间隔必须为正数');
      return;
    }
    cfg.intervalSec = sec;
    out('[定时发包] 间隔已修改: ' + sec + 's');
  };

  window.aqSetBatch = function(n){
    if(typeof n !== 'number' || n <= 0){
      out('[定时发包] ❌ 批次必须为正整数');
      return;
    }
    cfg.batchCount = n;
    out('[定时发包] 批次数已修改: ' + n);
  };

  window.aqSetPause = function(sec){
    if(typeof sec !== 'number' || sec <= 0){
      out('[定时发包] ❌ 暂停时间必须为正数');
      return;
    }
    cfg.pauseSec = sec;
    out('[定时发包] 暂停时间已修改: ' + sec + 's');
  };

  window.aqSetJitter = function(ratio){
    if(typeof ratio !== 'number' || ratio < 0 || ratio > 1){
      out('[定时发包] ❌ 抖动比例必须为 0~1');
      return;
    }
    cfg.jitter = ratio;
    out('[定时发包] 抖动已修改: ±' + (ratio*100) + '%');
  };

  out('[定时发包] v2.0 已加载 (修复原生API冲突)');
  out('  aqStart() 开始 | aqStop() 停止 | aqStatus() 查看');
  out('  默认: go(11, 39, {code:"0"}) 间隔6s 每10次暂停12s');
})();
