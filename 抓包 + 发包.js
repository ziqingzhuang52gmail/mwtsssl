// ============================================================
// 阿庆一体化工具 v1.0 — 抓包 + 发包 + 探查
// 控制台执行一次注入，提供以下功能：
//   go(mod, cmd, data)        ← 发包（最简洁）
//   send(mod, cmd, data)       ← 发包（别名）
//   sendByName(modName, cmd, data)  ← 按模块名发包
//   listModules()              ← 列出所有模块
//   listCommands(modId)        ← 列出模块命令
//   inspectProto(modId, cmdId) ← 查看协议字段
//   window._aq_protocol_log    ← 协议记录数组
// ============================================================
(function(){
var V='1.0';
console.warn('[阿庆工具] v'+V+' 注入中...');

// 存储原始函数（防止重复注入链式调用）
window._aq_orig=window._aq_orig||{};

// ───── 格式化输出 ─────
var _aqOut=function(dir,label,json){
  console.warn((dir==='C2S'?'🚀':'📥')+' ['+dir+'] '+label+' '+json);
};

// ───── 对象序列化（支持循环引用、Long、Binary）─────
var _aqStr=function(obj,depth,visited){
  if(depth===void 0)depth=0;
  if(visited===void 0)visited=new WeakSet();
  if(depth>5)return'...(max depth)';
  if(obj===null||obj===void 0)return String(obj);
  var t=typeof obj;
  if(t==='string')return'"'+obj.substring(0,500)+'"';
  if(t==='number'||t==='boolean')return String(obj);
  if(t==='bigint')return obj.toString()+'n';
  if(t==='function')return'[fn '+(obj.name||'anon')+']';
  if(t!=='object')return String(obj);
  if(obj instanceof Uint8Array||obj instanceof ArrayBuffer)return'['+(obj instanceof Uint8Array?'Uint8Array':'ArrayBuffer')+':'+(obj.length||obj.byteLength)+'B]';
  if(typeof Buffer!=='undefined'&&obj instanceof Buffer)return'[Buffer:'+obj.length+'B]';
  if(visited.has(obj))return'[Circular]';
  visited.add(obj);
  if(obj.constructor&&/^(Long|Int64|UInt64)$/.test(obj.constructor.name)){try{return obj.toString();}catch(e){}}
  if(Array.isArray(obj)){
    var arr=[],max=Math.min(obj.length,30);
    for(var i=0;i<max;i++){try{arr.push(_aqStr(obj[i],depth+1,visited));}catch(e){arr.push('?');}}
    if(obj.length>max)arr.push('...('+(obj.length-max)+' more)');
    return'['+arr.join(',')+']';
  }
  try{
    var plain={},keys=Object.keys(obj);
    for(var i=0;i<keys.length;i++){try{
      var v=obj[keys[i]];if(typeof v==='function'||v===void 0)continue;
      if(v!==null&&typeof v==='object'){
        if(v instanceof Uint8Array||v instanceof ArrayBuffer||(typeof Buffer!=='undefined'&&v instanceof Buffer)){plain[keys[i]]='[Binary:'+(v.length||v.byteLength)+'B]';continue;}
        if(v.constructor&&/^(Long|Int64|UInt64)$/.test(v.constructor.name)){plain[keys[i]]=v.toString();continue;}
      }
      plain[keys[i]]=v;
    }catch(e){plain[keys[i]]='[error]';}}
    var json=JSON.stringify(plain,null,2);
    return json.length<8000?json:json.substring(0,8000)+'\n...(truncated '+(json.length-8000)+' chars)';
  }catch(e){}
  try{return String(obj);}catch(e){return'[unknown]';}
};

window._aq_objToStr=_aqStr;
window._aq_protocol_log=[];

// ───── 获取 SocketMgr 实例 ─────
var _getSM=function(){try{var c=cc.js.getClassByName('SocketMgr');return c&&c._ins?c._ins:null;}catch(e){return null;}};
var _getGR=function(){try{var c=cc.js.getClassByName('GameRoomSocket');return c&&c._ins?c._ins:null;}catch(e){return null;}};

// ============================================================
// 第一部分：抓包（Hook send / parserS2C / log）
// ============================================================
var _restore=function(cn){
  var C=cc.js.getClassByName(cn);if(!C||!C.prototype)return;
  var p=C.prototype;
  if(p._aq_hk&&window._aq_orig[cn+'_send']){p.send=window._aq_orig[cn+'_send'];}
  if(p._aq_hk&&window._aq_orig[cn+'_s2c']){p.parserS2C=window._aq_orig[cn+'_s2c'];}
  if(p._aq_hk&&window._aq_orig[cn+'_log']){p.log=window._aq_orig[cn+'_log'];}
  delete p._aq_hk;
};

var _hook=function(cn){
  var C=cc.js.getClassByName(cn);if(!C||!C.prototype)return 0;
  var p=C.prototype;
  if(p._aq_hk)return 0;
  p._aq_hk=true;
  var n=0;

  // C2S send
  var os=window._aq_orig[cn+'_send']||p.send;
  window._aq_orig[cn+'_send']=os;
  p.send=function(m,cd,d){
    var mn='?',cn2='?';
    try{mn=this.getModuleName?this.getModuleName(m):'?';}catch(e){}
    try{cn2=this.getCmdName?this.getCmdName(m,cd):'?';}catch(e){}
    _aqOut('C2S',cn+'.'+mn+'.'+cn2,d!==void 0?_aqStr(d):'{}');
    return os.apply(this,arguments);
  };n++;

  // S2C parserS2C
  var op=window._aq_orig[cn+'_s2c']||p.parserS2C;
  window._aq_orig[cn+'_s2c']=op;
  p.parserS2C=function(sz,ss,md,cm,ic,b){
    var mn='?',cn2='?';
    try{mn=this.getModuleName?this.getModuleName(md):'?';}catch(e){}
    try{cn2=this.getCmdName?this.getCmdName(md,cm):'?';}catch(e){}
    window._aq_s2c_current={mName:mn,cName:cn2,mod:md,cmd:cm,size:sz,ssid:ss,isCompress:ic,decodedResult:null,logData:null};
    var result=op.apply(this,arguments);
    var finalData=window._aq_s2c_current.logData||result;
    var ds=_aqStr(finalData);
    if(ds&&ds.length>2&&ds!=='{}'&&ds!=='null'&&ds!=='undefined')_aqOut('S2C',cn+'.'+mn+'.'+cn2,ds);
    try{window._aq_s2c_current.decodedResult=finalData;}catch(e){}
    return result;
  };n++;

  // log（静默捕获）
  var ol=window._aq_orig[cn+'_log']||p.log;
  window._aq_orig[cn+'_log']=ol;
  p.log=function(){
    var si=window._aq_s2c_current;
    if(arguments.length>=2)try{si.logData=arguments[1];}catch(e){}
    if(si)window._aq_protocol_log.push({
      module:si.mName,cmd:si.cName,
      msg:arguments.length>=1?String(arguments[0]).substring(0,500):'',
      decoded:arguments.length>=2?arguments[1]:(si.decodedResult||null),time:Date.now()
    });
  };n++;

  return n;
};

// ============================================================
// 第二部分：发包
// ============================================================

// go(mod, cmd, data) — 最简洁的发包方式
// 例: go(24, 5, {handBookType:1, code:250005009})
window.go=function(mod,cmd,data){
  var sm=_getSM()||_getGR();
  if(!sm)return console.error('[go] 未找到 SocketMgr 实例');
  if(typeof sm.send!=='function')return console.error('[go] 实例没有 send 方法');
  var mn='?',cn='?';
  try{mn=sm.getModuleName?sm.getModuleName(mod):'?';}catch(e){}
  try{cn=sm.getCmdName?sm.getCmdName(mod,cmd):'?';}catch(e){}
  try{
    sm.send(mod,cmd,data||{});
    console.warn('[go] '+mn+'.'+cn+' 发送成功');
  }catch(e){console.error('[go] 发送失败: '+e.message);}
};

// send(mod, cmd, data) — go 的别名
window.send=function(mod,cmd,data){return window.go(mod,cmd,data);};

// sendByName(moduleName, cmdName, data)
// 例: sendByName('HandBookProxy','GetStarHandBookPoint',{handBookType:1,code:250005009})
window.sendByName=function(modName,cmdName,data){
  var sm=_getSM()||_getGR();if(!sm)return console.error('[sendByName] 未找到 SocketMgr');
  var modId=null;
  try{var dic=sm._moduleDic;for(var k in dic){if(dic.hasOwnProperty(k)&&dic[k]===modName){modId=parseInt(k);break;}}}catch(e){}
  if(modId===null)return console.error('[sendByName] 找不到模块 "'+modName+'"');
  var cmdId=null;
  try{var cmds=sm._cmdDic[modId];if(cmds){for(var k in cmds){if(cmds.hasOwnProperty(k)&&cmds[k]===cmdName){cmdId=parseInt(k);break;}}}}catch(e){}
  if(cmdId===null)return console.error('[sendByName] 找不到命令 "'+cmdName+'"');
  window.go(modId,cmdId,data);
};

// ============================================================
// 第三部分：探查工具
// ============================================================

window.listModules=function(){
  var sm=_getSM();if(!sm)return console.error('未找到 SocketMgr');
  try{
    var dic=sm._moduleDic,keys=[];
    for(var k in dic){if(dic.hasOwnProperty(k))keys.push(parseInt(k));}
    keys.sort(function(a,b){return a-b;});
    console.warn('===== 模块列表 ('+keys.length+' 个) =====');
    for(var i=0;i<keys.length;i++)console.warn('  '+keys[i]+': '+dic[keys[i]]);
  }catch(e){console.error('获取模块列表失败: '+e.message);}
};

window.listCommands=function(modId){
  var sm=_getSM();if(!sm)return console.error('未找到 SocketMgr');
  try{
    var mn=sm.getModuleName?sm.getModuleName(modId):'?';
    var cmds=sm._cmdDic[modId];if(!cmds)return console.warn('模块 '+modId+' ('+mn+') 没有命令');
    var keys=[];
    for(var k in cmds){if(cmds.hasOwnProperty(k)&&k!=='_keyList'&&k!=='_valueList'&&k!=='_isReadonly'&&k!=='_keyToIndex'&&k!=='_isIterating')keys.push(parseInt(k));}
    keys.sort(function(a,b){return a-b;});
    console.warn('===== 模块 '+modId+' ('+mn+') 命令 ('+keys.length+' 个) =====');
    for(var i=0;i<keys.length;i++)console.warn('  '+keys[i]+': '+cmds[keys[i]]);
  }catch(e){console.error('获取命令列表失败: '+e.message);}
};

window.inspectProto=function(modId,cmdId){
  var sm=_getSM();if(!sm)return console.error('未找到 SocketMgr');
  try{
    var proto=sm._responseDic.getValue(modId);if(!proto)return console.warn('模块 '+modId+' 没有协议');
    var cmdInfo=proto.getValue(cmdId);if(!cmdInfo)return console.warn('命令 '+cmdId+' 没有协议');
    var mn=sm.getModuleName?sm.getModuleName(modId):'?';
    var cn=sm.getCmdName?sm.getCmdName(modId,cmdId):'?';
    console.warn('===== 协议: '+mn+'.'+cn+' =====');
    console.warn('  once: '+cmdInfo.once+'  receiveErr: '+cmdInfo.receiveErr);
    if(cmdInfo.classInfo){
      try{
        var defs=cmdInfo.classInfo.getDefines(),ftNames=['varint','fixed64','len-delimited','start-group','end-group','fixed32'];
        console.warn('  字段:');
        for(var k in defs){if(k!=='_keyList'&&k!=='_valueList'&&k!=='_isReadonly'&&k!=='_keyToIndex'&&k!=='_isIterating')
          console.warn('    ['+k+'] '+defs[k].n+' ('+(ftNames[defs[k].ft]||defs[k].ft)+')');
        }
      }catch(e){console.warn('  classInfo: 存在');}
    }else console.warn('  classInfo: 无');
  }catch(e){console.error('检查协议失败: '+e.message);}
};

// ============================================================
// 初始化：恢复旧钩子 → 挂载新钩子
// ============================================================
_restore('SocketMgr');_restore('GameRoomSocket');
var t=_hook('SocketMgr')+_hook('GameRoomSocket');

if(t===0){
  console.warn('[阿庆工具] 未找到Socket类，5秒后重试...');
  setTimeout(function(){eval('('+arguments.callee.toString()+')()');},5000);
}else{
  console.warn('[阿庆工具] v'+V+' 就绪 ('+t+' 钩子)');
  console.warn('─'.repeat(40));
  console.warn('  go(24, 5, {handBookType:1, code:250005009})');
  console.warn('  sendByName("HandBookProxy","GetStarHandBookPoint",{...})');
  console.warn('  listModules() / listCommands(24) / inspectProto(24,5)');
  console.warn('  window._aq_protocol_log  ← 协议记录');
  console.warn('─'.repeat(40));
}
})();