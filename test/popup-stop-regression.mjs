import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../popup/popup.js',import.meta.url),'utf8');
const elements=new Map(),messages=[],results=[];
let finish,started;
const start=new Promise(resolve=>started=resolve);
const context={setTimeout,clearTimeout,setInterval,clearInterval,collect:()=>{},persistProfileEdits:async()=>{},UPDATES:{empty:v=>!v},profile:{name:'演示'},settings:{aiEnabled:false},
  $:key=>{if(!elements.has(key))elements.set(key,{});return elements.get(key);},
  showResult:text=>results.push(text),
  chrome:{storage:{local:{set:async()=>{}}},tabs:{query:async()=>[{id:1}],sendMessage:async(_,message)=>{
    messages.push(message.type);
    if(message.type==='PING')return {ok:true,contentBuild:'1.15.0-dev'};
    if(message.type==='SCAN_FORM') return {totalControls:3,ruleCandidates:3,aiCandidates:0};
    if(message.type==='FILL_FORM') {assert.equal(message.overwrite,true);started();return new Promise(resolve=>finish=resolve);}
    if(message.type==='STOP_FILL') {finish({note:'fill-cancelled',filled:['姓名']});return {ok:true};}
    return {running:true,phase:'filling',completed:1,total:3,field:'民族'};
  }}}
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('let fillSession ='),source.indexOf('/* ---------- 备份：'))+'\nthis.fill=fillCurrentTab;this.stop=stopCurrentFill;',context);
context.$('#overwrite').checked=true;
const filling=context.fill();await start;
assert.equal(elements.get('#overwrite').checked,false,'overwrite is consumed by this run');
assert.equal(elements.get('#fillBtn').disabled,true);
assert.equal(elements.get('#stopFillBtn').hidden,false);
await context.stop();await filling;
assert.equal(elements.get('#fillBtn').disabled,false);
assert.equal(elements.get('#stopFillBtn').hidden,true);
assert.ok(messages.includes('STOP_FILL'));
assert.ok(results.at(-1).includes('已停止'));
assert.ok(results.at(-1).includes('1 项'));
console.log('popup stop passed: button visibility, cancellation request, partial result, restored fill button');
