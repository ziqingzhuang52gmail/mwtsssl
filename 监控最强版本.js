// ============================================================
// 阿庆协议监控 v1.1 — 简洁 JSON 格式实时打印 + 发包功能
// 格式：🚀 [C2S] SocketMgr.TaskProxy(17).TaskInfoUpdate(27) { "taskSubType": 1037, "param": 1 }
//       📥 [S2C] SocketMgr.TaskProxy(17).TaskInfoUpdateR(28) { "err": 0, "data": {...} }
//
// 特性：
//   1. 默认实时打印，自动过滤 Ping
//   2. 简洁格式：方向 + SocketMgr.Proxy(mod).Cmd(cmd) + JSON数据
//   3. console.info 输出（不被 SetDebugModel 覆写）
//   4. 支持隐藏来源：hide("ActivityProxy") / show("ActivityProxy") / hidden()
//   5. 支持关键词过滤：only("Damage") / clearOnly()
//   6. v1.1 新增发包功能：go(mod, cmd, data) / sendLine("粘贴日志行")
//
// 用法：
//   hide("ActivityProxy")    隐藏来自某 Proxy 的消息
//   show("ActivityProxy")    恢复显示
//   hidden()                 列出隐藏来源
//   only("Damage")           只显示含关键词的消息
//   clearOnly()              清除关键词过滤
//   pause()                  暂停打印
//   resume()                 恢复打印
//   pmStats()                统计信息
//
// 发包功能（v1.1）：
//   go(18, 13, {code:'1009107'})                    直接发包
//   sendLine("[C2S] SocketMgr.ActivityProxy(18).GetCommonReward(13) {code:'1009107'}")
//   sl("[C2S] SocketMgr.ActivityProxy(18).GetCommonReward(13) {code:'1009107'}")
//   resend()                                        重发上一条 C2S
//   last()                                          查看最近一条 C2S
// ============================================================
(function(){
  if(window._aq_pm_v1){
    console.info('[协议监控] 已注入，跳过');
    return;
  }
  window._aq_pm_v1=true;
  var V='1.0';
  var out=console.info.bind(console);

  // ── 配置 ──
  var _paused=false;
  var _filterPing=true;
  var _hidden={};
  var _onlyKw=null;
  var _stats={c2s:0,s2c:0,filtered:0};
  var MAX=500;
  var _buf=[];

  // ── 对象序列化 ──
  function jstr(o,d,s){
    if(d===undefined)d=0;
    if(s===undefined)s=[];
    if(d>3)return'...';
    if(o===null||o===undefined)return String(o);
    var t=typeof o;
    if(t==='string')return o.length>500?o.substring(0,500)+'...':o;
    if(t==='number'||t==='boolean')return String(o);
    if(t==='function')return'[fn]';
    if(t!=='object')return String(o);
    if(o instanceof Uint8Array||o instanceof ArrayBuffer)return'[Bin:'+(o.length||o.byteLength)+']';
    for(var i=0;i<s.length;i++){if(s[i]===o)return'[Circular]';}
    s.push(o);
    try{if(o.constructor&&/^(Long|Int64|UInt64)/.test(o.constructor.name)){s.pop();return o.toString();}}catch(e){}
    var r,k;
    if(Array.isArray(o)){
      r=[];var max=Math.min(o.length,20);
      for(var j=0;j<max;j++){try{r.push(jstr(o[j],d+1,s));}catch(e){r.push('?');}}
      if(o.length>max)r.push('...('+(o.length-max)+')');
      s.pop();return r;
    }
    r={};k=Object.keys(o);
    for(var j=0;j<k.length;j++){
      try{var v=o[k[j]];if(typeof v==='function'||v===undefined)continue;r[k[j]]=jstr(v,d+1,s);}
      catch(e){r[k[j]]='[err]';}
    }
    s.pop();return r;
  }

  // ── 解析日志消息，提取 proxy/cmd 信息 ──
  function parseMsg(msg){
    // C2S: " 发送 Ping(8) 来自 LoginGameProxy(2), 长度:0, ssid:47"
    // S2C: " 收到 PingR(9) 来自 LoginGameProxy(2), 错误码:0, 长度:15, ssid:47"
    var isSend=msg.indexOf('\u53d1\u9001')>=0;
    var isRecv=msg.indexOf('\u6536\u5230')>=0;
    if(!isSend&&!isRecv) return null;
    var dir=isSend?'C2S':'S2C';
    // 提取 cmdName(cmdId) 和 proxyName(modId)
    var m=msg.match(/(\w+)\((\d+)\)\s*\u6765\u81ea\s*(\w+)\((\d+)\)/);
    if(!m) return null;
    return {
      dir:dir,
      cmdName:m[1],
      cmdId:parseInt(m[2]),
      proxyName:m[3],
      modId:parseInt(m[4])
    };
  }

  // ── 主处理函数 ──
  function onLog(msg,data){
    var p=parseMsg(msg);
    if(!p) return;

    // 缓存
    _buf.push({p:p,data:data,ts:new Date().toLocaleTimeString()});
    if(_buf.length>MAX) _buf.shift();

    // 统计
    if(p.dir==='C2S') _stats.c2s++; else _stats.s2c++;

    // 过滤：暂停
    if(_paused) return;
    // 过滤：Ping
    if(_filterPing && p.cmdName.indexOf('Ping')>=0){
      _stats.filtered++;
      return;
    }
    // 过滤：隐藏来源
    if(_hidden[p.proxyName]){
      _stats.filtered++;
      return;
    }
    // 过滤：关键词
    if(_onlyKw){
      var msgLower=msg.toLowerCase();
      var dataStr='';
      try{dataStr=JSON.stringify(jstr(data)).toLowerCase();}catch(e){}
      if(msgLower.indexOf(_onlyKw.toLowerCase())<0 && dataStr.indexOf(_onlyKw.toLowerCase())<0){
        _stats.filtered++;
        return;
      }
    }

    // 输出：🚀 [C2S] SocketMgr.TaskProxy(17).TaskInfoUpdate(27) { json }
    var icon=p.dir==='C2S'?'\uD83D\uDE80':'\uD83D\uDCE5';
    var prefix=icon+' ['+p.dir+'] SocketMgr.'+p.proxyName+'('+p.modId+').'+p.cmdName+'('+p.cmdId+')';
    if(data!==null&&data!==undefined){
      out(prefix, jstr(data));
    }else{
      out(prefix);
    }
  }

  // ── hook SocketMgr/GameRoomSocket ──
  function hookClass(cn){
    var C=cc.js.getClassByName(cn);
    if(!C||!C.prototype) return false;
    var p=C.prototype;
    if(p._aq_pm) return false;
    p._aq_pm=true;
    var orig=p.log;
    p.log=function(){
      var a=Array.prototype.slice.call(arguments);
      onLog(String(a[0]||''), a.length>1?a[1]:null);
      return orig.apply(this,arguments);
    };
    return true;
  }

  function init(){
    var n=0;
    try{if(hookClass('SocketMgr'))n++;}catch(e){}
    try{if(hookClass('GameRoomSocket'))n++;}catch(e){}
    if(n>0){
      out('[协议监控] v'+V+' \u5c31\u7eea\u3001hook '+n+'\u4e2a\u7c7b\u3001\u5b9e\u65f6\u6253\u5370\u5df2\u5f00\u542f');
      out('  hide("ActivityProxy") \u9690\u85cf\u6765\u6e90 | only("Damage") \u53ea\u770b\u5173\u952e\u8bcd | pause() \u6682\u505c');
      out('  go(18,13,{code:"1009107"}) \u53d1\u5305 | sl("\u7c98\u8d34\u65e5\u5fd7\u884c") \u89e3\u6790\u53d1\u5305 | resend() \u91cd\u53d1');
    }else{
      setTimeout(init,1000);
    }
  }

  // ── 指令 ──
  window.hide=function(name){
    _hidden[name]=true;
    out('[协议监控] \u5df2\u9690\u85cf '+name);
  };
  window.show=function(name){
    delete _hidden[name];
    out('[协议监控] \u5df2\u6062\u590d '+name);
  };
  window.hidden=function(){
    var keys=Object.keys(_hidden);
    out('[协议监控] \u9690\u85cf\u6765\u6e90 ('+keys.length+'\u4e2a): '+(keys.length>0?keys.join(', '):'\u65e0'));
  };
  window.only=function(kw){
    _onlyKw=kw;
    out('[协议监控] \u53ea\u663e\u793a\u542b "'+kw+'" \u7684\u6d88\u606f');
  };
  window.clearOnly=function(){
    _onlyKw=null;
    out('[协议监控] \u5173\u952e\u8bcd\u8fc7\u6ee4\u5df2\u6e05\u9664');
  };
  window.pause=function(){
    _paused=true;
    out('[协议监控] \u5df2\u6682\u505c\u6253\u5370');
  };
  window.resume=function(){
    _paused=false;
    out('[协议监控] \u5df2\u6062\u590d\u6253\u5370');
  };
  window.pmStats=function(){
    out('[协议监控] \u7edf\u8ba1: C2S='+_stats.c2s+' S2C='+_stats.s2c+' \u8fc7\u6ee4='+_stats.filtered+' \u7f13\u5b58='+_buf.length);
  };
  window.pmBuf=function(n){
    if(n===undefined)n=20;
    var start=Math.max(0,_buf.length-n);
    out('[协议监控] \u7f13\u5b58 '+_buf.length+'\u6761, \u663e\u793a'+(_buf.length-start)+'\u6761:');
    for(var i=start;i<_buf.length;i++){
      var e=_buf[i];
      var icon=e.p.dir==='C2S'?'\uD83D\uDE80':'\uD83D\uDCE5';
      out(icon+' ['+e.p.dir+'] '+e.ts+' SocketMgr.'+e.p.proxyName+'('+e.p.modId+').'+e.p.cmdName+'('+e.p.cmdId+')', e.data?jstr(e.data):null);
    }
  };

  // ── v1.1 发包功能 ──
  var _lastSend=null;  // 记录最后一条 C2S

  // 自动捕获 C2S 记录最后发包（在 onLog 中已缓存，这里提取）
  // 通过遍历 _buf 找最后一条 C2S
  function findLastC2S(){
    for(var i=_buf.length-1;i>=0;i--){
      if(_buf[i].p.dir==='C2S') return _buf[i];
    }
    return null;
  }

  // go(mod, cmd, data) — 直接发包
  window.go=function(mod, cmd, data){
    try{
      var C=cc.js.getClassByName('SocketMgr');
      var ins=C?C.Ins:null;
      if(!ins){out('[协议监控] \u274c SocketMgr.Ins \u4e0d\u5b58\u5728');return false;}
      if(!ins._socket||ins._socket.readyState!==1){out('[协议监控] \u274c WebSocket \u672a\u8fde\u63a5');return false;}
      if(data===undefined)data=null;
      ins.send(mod, cmd, data);
      var modName=ins.getModuleName?ins.getModuleName(mod):mod;
      var cmdName=ins.getCmdName?ins.getCmdName(mod,cmd):cmd;
      _lastSend={mod:mod,cmd:cmd,data:data,modName:modName,cmdName:cmdName};
      out('\uD83D\uDE80 [发包] go('+mod+', '+cmd+', '+(data?JSON.stringify(jstr(data)):'null')+')  '+modName+'.'+cmdName);
      return true;
    }catch(e){
      out('[协议监控] \u53d1\u5305\u5931\u8d25: '+e.message);
      return false;
    }
  };

  // sendLine(line) / sl(line) — 粘贴日志行，自动解析并发包
  // 支持: [C2S] SocketMgr.ActivityProxy(18).GetCommonReward(13) {code:'1009107'}
  // 支持: 发送 GetCommonReward(13) 来自 ActivityProxy(18), 长度:2, ssid:1
  function parseSendLine(line){
    var flat=line.replace(/\s+/g,' ').trim();
    // 提取 ProxyName(modId).CmdName(cmdId)
    var m=flat.match(/(\w+)\((\d+)\)\.(\w+)\((\d+)\)/);
    var mod,cmd;
    if(m){
      mod=parseInt(m.group?m[2]:m[2]);
      cmd=parseInt(m.group?m[4]:m[4]);
    }else{
      // 原始格式: CmdName(cmdId) 来自 ProxyName(modId)
      var m2=flat.match(/(\w+)\((\d+)\)\s*\u6765\u81ea\s*(\w+)\((\d+)\)/);
      if(m2){
        cmd=parseInt(m2[2]);
        mod=parseInt(m2[4]);
      }else{
        return null;
      }
    }
    // 提取 data
    var dataMatch=flat.match(/\{.*\}/);
    var dataObj=null;
    if(dataMatch){
      var dataStr=dataMatch[0];
      // 尝试 JSON.parse，失败则修复单引号
      try{dataObj=JSON.parse(dataStr);}
      catch(e){
        var fixed=dataStr.replace(/'/g,'"').replace(/(\w+):/g,'"$1":');
        try{dataObj=JSON.parse(fixed);}catch(e2){dataObj=null;}
      }
    }
    return {mod:mod,cmd:cmd,data:dataObj};
  }

  window.sendLine=function(line){
    var p=parseSendLine(line);
    if(!p){out('[协议监控] \u274c \u65e0\u6cd5\u89e3\u6790: '+line.substring(0,80));return false;}
    return window.go(p.mod, p.cmd, p.data);
  };
  window.sl=window.sendLine;

  // resend() — 重发上一条
  window.resend=function(){
    var last=findLastC2S();
    if(!last){out('[协议监控] \u6ca1\u6709\u53ef\u91cd\u53d1\u7684\u5305');return false;}
    return window.go(last.p.modId, last.p.cmdId, last.data);
  };

  // last() — 查看最近一条 C2S
  window.last=function(){
    var last=findLastC2S();
    if(!last){out('[协议监控] \u6ca1\u6709 C2S \u8bb0\u5f55');return;}
    out('[协议监控] \u6700\u8fd1\u4e00\u6761 C2S:');
    out('  \u2199 '+last.ts+' SocketMgr.'+last.p.proxyName+'('+last.p.modId+').'+last.p.cmdName+'('+last.p.cmdId+')', last.data?jstr(last.data):null);
    out('  go('+last.p.modId+', '+last.p.cmdId+', '+(last.data?JSON.stringify(jstr(last.data)):'null')+')');
  };

  // ── 定时巡检 ──
  if(window._aq_pm_timer){clearInterval(window._aq_pm_timer);}
  window._aq_pm_timer=setInterval(function(){
    try{
      var C=cc.js.getClassByName('SocketMgr');
      if(C&&C.prototype&&!C.prototype._aq_pm){hookClass('SocketMgr');out('[协议监控] \u91cd\u65b0hook SocketMgr');}
      var G=cc.js.getClassByName('GameRoomSocket');
      if(G&&G.prototype&&!G.prototype._aq_pm){hookClass('GameRoomSocket');out('[协议监控] \u91cd\u65b0hook GameRoomSocket');}
    }catch(e){}
  },5000);

  out('[协议监控] v'+V+' \u811a\u672c\u5df2\u52a0\u8f7d\uff0c\u7b49\u5f85 hook SocketMgr...');
  init();
})();
