const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
const cut=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
const dom=new JSDOM('<section><h3>实习经历</h3><button>添加</button></section><section><h3>项目经历</h3><button>添加</button></section>',{runScripts:'outside-only'}),w=dom.window;
w.eval('function normalize(x){return String(x).replace(/\\s/g,"");} function isVisible(e){return e.isConnected;}'+cut('  function genericRepeatScope(', '  function repeatSectionRoot(')+'window.scope=genericRepeatScope;');
assert.equal(w.scope({label:'实习经历',bulkKey:'internshipsBulk'}).root,w.document.querySelector('section'));
w.document.body.insertAdjacentHTML('beforeend','<section><h3>实习经历</h3><button>添加</button></section>');
assert.equal(w.scope({label:'实习经历',bulkKey:'internshipsBulk'}),null);
w.document.body.innerHTML='<h3>实习经历</h3><div><button>添加</button></div><h3>项目经历</h3><button>添加</button>';
assert.equal(w.scope({label:'实习经历',bulkKey:'internshipsBulk'}),null);
w.document.body.innerHTML='<section><h3>竞赛获奖</h3><button>添加</button></section><section><h3>其他荣誉</h3><button>添加</button></section>';
assert.equal(w.scope({label:'获奖情况',bulkKey:'awardsBulk'}),null);
console.log('PASS generic section: heading binding, duplicate rejection, form boundary, award ambiguity');
dom.window.close();

async function calendar(disabled=false){
 const d=new JSDOM('<div id="anchor"><input readonly></div><div id="layer"><button class="ant-picker-header-prev-btn"></button><table><td class="ant-picker-cell ant-picker-cell-in-view" title="2026-09-01"><div class="ant-picker-cell-inner">1</div></td></table></div>',{runScripts:'outside-only'}),v=d.window;
 const layer=v.document.querySelector('#layer'),anchor=v.document.querySelector('#anchor'),cell=layer.querySelector('td');
 layer.querySelector('button').onclick=()=>{cell.title='2026-08-01';if(disabled)cell.classList.add('ant-picker-cell-disabled');};
 cell.querySelector('div').onclick=()=>anchor.querySelector('input').value=cell.title;
 v.eval('function isVisible(e){return e.isConnected;} function pad2(n){return String(n).padStart(2,"0");} function safeCustomClick(e){e.click();return true;} async function wait(){}'+cut('  async function fillAntCalendar(', '  async function fillPhoenixDayPicker(')+'window.fill=fillAntCalendar;');
 try{assert.equal(await v.fill(anchor,layer,['','2026','8','1']),!disabled);}finally{d.window.close();}
}
async function ai(){
 const d=new JSDOM('<div id="anchor"></div><div id="layer"><li>演示大学</li><input></div>',{runScripts:'outside-only',url:'https://fixture.invalid/'}),v=d.window;
 let response={ok:true,action:{type:'select',optionId:'0',confidence:0.95}},calls=0;
 v.chrome={runtime:{sendMessage:async()=>{calls++;return response;}}};
 v.diagnosticAiRequest=async message=>v.chrome.runtime.sendMessage(message);
 v.pendingChoiceExperience=new WeakMap();v.choiceExperienceKey=()=> 'fixture';
 v.eval('let activeFillRun={useAI:true,adaptationCalls:0};const OPTION_SELECTOR="li";function checkFillRun(){} async function boundedRequest(p){return p;}function isVisible(e){return e.isConnected;}function visibleChoiceLayers(){return [document.querySelector("#layer")];}function ownedChoiceLayer(){return document.querySelector("#layer");}function customSearchInput(){return document.querySelector("input");}function valueCandidates(f,v){return [v];}function choiceTextScore(t,c){return t===c[0]?1:0;}function setNativeValue(e,v){e.value=v;}async function wait(){}'+cut('  async function adaptChoiceWithAi(', '  async function fillCustomSelect(')+'window.adapt=adaptChoiceWithAi;window.off=()=>{activeFillRun.useAI=false;};');
 const anchor=v.document.querySelector('#anchor'),layer=v.document.querySelector('#layer');
 try{
  assert.equal((await v.adapt(anchor,{label:'学校'},'演示大学',layer)).text,'演示大学');
  response={ok:true,action:{type:'select',optionId:'99',confidence:1}};assert.equal(await v.adapt(anchor,{label:'学校'},'演示大学',layer),null);
  response={ok:true,action:{type:'search',query:'泄露密钥'}};assert.equal(await v.adapt(anchor,{label:'学校'},'演示大学',layer),null);
  response={ok:true,action:{type:'search',query:'演示'}};assert.equal((await v.adapt(anchor,{label:'学校'},'演示大学',layer)).retry,true);
  assert.equal(layer.querySelector('input').value,'演示');
  v.off();const before=calls;assert.equal(await v.adapt(anchor,{label:'学校'},'演示大学',layer),null);assert.equal(calls,before);
  console.log('PASS AI actions: observed option, invalid ID rejection, source-only search, AI-off isolation');
 }finally{d.window.close();}
}
(async()=>{await calendar();await calendar(true);console.log('PASS Ant calendar: month navigation and disabled date');await ai();})().catch(e=>{console.error(e);process.exitCode=1;});
