// ==UserScript==
// @name         玩家数据采集 - 离线时长判断
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  采集 fightCap>=900000 且离线超过12小时的玩家，监控 PlayerInfoProxy.GetBasePlayerInfosR 协议 (iOS 专用)
// @author       Ace
// @match        *://*/*
// @grant        none
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

// ============================================================
// 玩家数据采集脚本 v6.0 — 离线时长判断版
// 一次执行，自动：Hook抓包 + 采集 name+username
// 目标协议：PlayerInfoProxy.GetBasePlayerInfosR (Mod 13, Cmd 32)
// 采集条件：fightCap >= 900000 且 离线超过12小时
// ============================================================
(function(){
var V='6.0';
var THRESHOLD=200000;
var OFFLINE_THRESHOLD=4*60*60; // 12小时（秒）
var TARGET_MOD=13;
var TARGET_CMD=32;

// iOS Safari 优化：使用 console.log 替代 console.warn
var log=function(msg){
  console.log('[玩家采集] ' + msg);
};

log('==================================================');
log('v'+V+' 注入中...');
log('[条件] fightCap >= '+THRESHOLD+' 且 离线超过12小时');
log('==================================================');

// 全局存储
window._aq_collect_ctx=window._aq_collect_ctx||{};
if(!window._aq_collect_ctx.players){
  window._aq_collect_ctx.players=[];
  window._aq_collect_ctx.dedup={};
}
var CTX=window._aq_collect_ctx;

// 复制剪贴板 (iOS Safari 兼容)
var copyText=function(text){
  try{
    // 优先使用现代 Clipboard API
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){
        log('已复制到剪贴板');
      }).catch(function(){
        fallbackCopy(text);
      });
    }else{
      fallbackCopy(text);
    }
  }catch(e){
    fallbackCopy(text);
  }
};

// 降级复制方法
var fallbackCopy=function(text){
  var ta=document.createElement('textarea');
  ta.value=text;
  ta.style.cssText='position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  ta.setAttribute('readonly','');
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0,9999);
  try{
    document.execCommand('copy');
    log('已复制到剪贴板');
  }catch(e){
    log('复制失败: '+e.message);
  }
  document.body.removeChild(ta);
};

// 弹窗提示 (iOS Safari 优化)
var popup=function(title,msg,dataText){
  copyText(dataText);
  setTimeout(function(){
    if(confirm(title+'\n\n'+msg+'\n\n数据已复制，点击[确定]再次复制')){
      copyText(dataText);
    }
  },100);
};

// 核心采集逻辑
var processDecoded=function(decoded,modId,cmdId){
  if(modId!==TARGET_MOD||cmdId!==TARGET_CMD)return 0;
  if(!decoded||!decoded.baseInfos)return 0;

  var baseInfos=decoded.baseInfos;
  var found=[];
  var keys=Object.keys(baseInfos);

  // 获取当前时间戳（秒）
  var currentTime=Math.floor(Date.now()/1000);

  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    if(k==='_keyList'||k==='_valueList'||k==='_isReadonly'||
       k==='_TempSort'||k==='_keyToIndex'||k==='_isIterating'||k==='_length'){
      continue;
    }

    var p=baseInfos[k];
    if(!p||typeof p!=='object')continue;

    // 检查战力条件
    if(p.fightCap>=THRESHOLD){
      // 检查离线时间
      var offlineTime=p.offlineTime||0;

      // offlineTime=0 表示在线，不采集
      if(offlineTime===0){
        continue;
      }

      // 计算离线时长（秒）
      var offlineDuration=currentTime-offlineTime;

      // 判断是否超过12小时
      if(offlineDuration<OFFLINE_THRESHOLD){
        continue;
      }

      // 满足所有条件，进行采集
      var uname=p.username||'?';
      if(CTX.dedup[uname])continue;
      CTX.dedup[uname]=true;

      // 计算离线天数和小时数（用于显示）
      var offlineDays=Math.floor(offlineDuration/(24*60*60));
      var offlineHours=Math.floor((offlineDuration%(24*60*60))/(60*60));

      var entry={
        name:p.name||'???',
        username:uname,
        fightCap:p.fightCap,
        offlineTime:offlineTime,
        offlineDuration:offlineDuration,
        offlineDays:offlineDays,
        offlineHours:offlineHours
      };
      found.push(entry);
      CTX.players.push(entry);
    }
  }

  if(found.length>0){
    var newText='';
    var allText='';
    for(var j=0;j<found.length;j++){
      var days=found[j].offlineDays;
      var hours=found[j].offlineHours;
      var offlineStr=days>0?(days+'天'+hours+'小时'):(hours+'小时');
      newText+=found[j].name+' '+found[j].username+' (战力:'+found[j].fightCap+',离线:'+offlineStr+')\n';
    }
    for(var m=0;m<CTX.players.length;m++){
      var days2=CTX.players[m].offlineDays;
      var hours2=CTX.players[m].offlineHours;
      var offlineStr2=days2>0?(days2+'天'+hours2+'小时'):(hours2+'小时');
      allText+=CTX.players[m].name+' '+CTX.players[m].username+' (战力:'+CTX.players[m].fightCap+',离线:'+offlineStr2+')\n';
    }

    log('[采集] 本次 +'+found.length+' 人 (累计 '+CTX.players.length+' 人):');
    for(var n=0;n<found.length;n++){
      var d=found[n].offlineDays;
      var h=found[n].offlineHours;
      var offStr=d>0?(d+'天'+h+'小时'):(h+'小时');
      log('  '+found[n].name+' | '+found[n].username+' | 战力:'+found[n].fightCap+' | 离线:'+offStr);
    }

    popup(
      '采集成功! 本次 +'+found.length+' 人 (累计 '+CTX.players.length+' 人)',
      '本次采集:\n'+newText,
      allText
    );
  }
  return found.length;
};

// 手动操作函数
window.showPlayers=function(){
  var all=CTX.players;
  if(all.length===0){log('[结果] 暂无采集数据');return;}
  log('==================================================');
  log('[采集结果] 共 '+all.length+' 人 (fightCap >= '+THRESHOLD+', 离线超过12小时)');
  log('==================================================');
  for(var i=0;i<all.length;i++){
    var days=all[i].offlineDays;
    var hours=all[i].offlineHours;
    var offlineStr=days>0?(days+'天'+hours+'小时'):(hours+'小时');
    log('  ['+(i+1)+'] '+all[i].name+' '+all[i].username+' | 战力:'+all[i].fightCap+' | 离线:'+offlineStr);
  }
  log('==================================================');
};

window.copyPlayers=function(){
  var all=CTX.players;
  if(all.length===0){log('[复制] 暂无数据');return;}
  var text='';
  for(var i=0;i<all.length;i++){
    var days=all[i].offlineDays;
    var hours=all[i].offlineHours;
    var offlineStr=days>0?(days+'天'+hours+'小时'):(hours+'小时');
    text+=all[i].name+' '+all[i].username+' (战力:'+all[i].fightCap+',离线:'+offlineStr+')\n';
  }
  copyText(text);
  setTimeout(function(){
    alert('已复制 '+all.length+' 个玩家:\n\n'+text);
  },100);
};

window.clearPlayers=function(){
  CTX.players=[];
  CTX.dedup={};
  log('[清空] 采集数据已重置');
};

// ============================================================
// Hook 引擎
// ============================================================

var _aqOrig=window._aq_orig||{};
window._aq_orig=_aqOrig;

var restoreHooks=function(cn){
  var C=cc.js.getClassByName(cn);
  if(!C||!C.prototype)return;
  var p=C.prototype;
  if(p._aq_hk&&_aqOrig[cn+'_send']){p.send=_aqOrig[cn+'_send'];}
  if(p._aq_hk&&_aqOrig[cn+'_s2c']){p.parserS2C=_aqOrig[cn+'_s2c'];}
  if(p._aq_hk&&_aqOrig[cn+'_log']){p.log=_aqOrig[cn+'_log'];}
  delete p._aq_hk;
};

var hookClass=function(cn){
  var C=cc.js.getClassByName(cn);
  if(!C||!C.prototype)return 0;
  var p=C.prototype;
  if(p._aq_hk)return 0;
  p._aq_hk=true;
  var n=0;

  // Hook send
  var os=_aqOrig[cn+'_send']||p.send;
  _aqOrig[cn+'_send']=os;
  p.send=function(m,cd,d){
    return os.apply(this,arguments);
  };
  n++;

  // Hook parserS2C - 核心
  var op=_aqOrig[cn+'_s2c']||p.parserS2C;
  _aqOrig[cn+'_s2c']=op;
  p.parserS2C=function(sz,ss,md,cm,ic,b){
    window._aq_s2c_ctx={mod:md,cmd:cm,decodedResult:null,logData:null};
    var result=op.apply(this,arguments);
    var finalData=window._aq_s2c_ctx.logData||result;
    window._aq_s2c_ctx.decodedResult=finalData;

    // 直接采集目标协议
    processDecoded(finalData,md,cm);

    return result;
  };
  n++;

  // Hook log
  var ol=_aqOrig[cn+'_log']||p.log;
  _aqOrig[cn+'_log']=ol;
  p.log=function(){
    var ctx=window._aq_s2c_ctx;
    if(arguments.length>=2){
      try{ctx.logData=arguments[1];}catch(e){}
    }
  };
  n++;

  return n;
};

// 执行 Hook
var initHook=function(){
  restoreHooks('SocketMgr');
  restoreHooks('GameRoomSocket');
  var total=hookClass('SocketMgr')+hookClass('GameRoomSocket');

  if(total===0){
    log('未找到Socket类，5秒后重试...');
    setTimeout(function(){
      restoreHooks('SocketMgr');
      restoreHooks('GameRoomSocket');
      var t=hookClass('SocketMgr')+hookClass('GameRoomSocket');
      if(t===0){
        log('仍未找到，请确认已进入游戏');
      }else{
        showReady(t);
      }
    },5000);
  }else{
    showReady(total);
  }
};

// 显示就绪信息
var showReady=function(hookCount){
  log('v'+V+' 就绪 ('+hookCount+' Hook)');
  log('==================================================');
  log('[自动化] 打开排行榜 -> 自动采集 fightCap>='+THRESHOLD+' 且离线超过12小时');
  log('[手动] showPlayers() / copyPlayers() / clearPlayers()');
  log('==================================================');
};

// 启动
initHook();

})();