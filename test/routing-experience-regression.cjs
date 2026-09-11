const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
const cut=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
async function routing(){
 const d=new JSDOM('<section><h3>竞赛获奖</h3><button>添加</button></section><section><h3>其他荣誉</h3><button>添加</button></section>',{runScripts:'outside-only'}),w=d.window;
 let routes=[{recordId:'0',sectionId:'0',confidence:.95},{recordId:'1',sectionId:'1',confidence:.95}],calls=0;
 w.chrome={runtime:{sendMessage:async()=>{calls++;return {ok:true,routes};}}};
 w.diagnosticAiRequest=async message=>w.chrome.runtime.sendMessage(message);
 w.eval('let activeFillRun={useAI:true};function normalize(x){return x;}function isVisible(e){return e.isConnected;}function checkFillRun(){}async function boundedRequest(p){return p;}'+cut('  function genericRepeatScope(','  function repeatSectionRoot(')+'window.route=routeRepeatGroups;window.scope=genericRepeatScope;window.off=()=>activeFillRun.useAI=false;');
 const items=[{group:{label:'获奖情况',bulkKey:'awardsBulk'},records:[{awardName:'比赛一等奖'},{awardName:'奖学金'}]}];
 try{
  let summary={failed:[]},result=await w.route(items,summary);
  assert.equal(result.length,2);assert.equal(result[1].records[0].awardName,'奖学金');assert.equal(summary.failed.length,0);
  assert.equal(w.scope(result[1].group).title,'其他荣誉');
  routes=[{recordId:'0',sectionId:'0',confidence:.95},{recordId:'0',sectionId:'1',confidence:.95},{recordId:'1',sectionId:'99',confidence:1}];
  summary={failed:[]};assert.equal((await w.route(items,summary)).length,0);assert.equal(summary.failed.length,2);
  w.off();const before=calls;summary={failed:[]};await w.route(items,summary);assert.equal(calls,before);assert.equal(summary.failed.length,2);
  console.log('PASS routing: two destinations, duplicate/unknown IDs rejected, AI-off no requests');
 }finally{w.close();}
}
async function experience(){
 const d=new JSDOM('<div id="anchor" class="ant-select"></div><div id="layer"><input></div>',{runScripts:'outside-only',url:'https://fixture.invalid/'}),w=d.window;
 let store={};
 w.chrome={storage:{local:{get:async()=>store,set:async x=>{store=x;}}}};
 w.eval('let activeFillRun={useAI:true};function checkFillRun(){}function customSearchInput(){return document.querySelector("input");}function visibleChoiceLayers(){return [document.querySelector("#layer")];}function ownedChoiceLayer(){return document.querySelector("#layer");}function setNativeValue(e,v){e.value=v;}async function wait(){}'+cut('  const pendingChoiceExperience =','  async function adaptChoiceWithAi(')+'window.key=choiceExperienceKey;window.replay=replayChoiceExperience;window.finish=finishChoiceExperience;window.seed=(a,k)=>pendingChoiceExperience.set(a,{key:k,entry:{type:"search-prefix",length:2}});');
 const anchor=w.document.querySelector('#anchor'),layer=w.document.querySelector('#layer'),field={key:'school'};
 try{
  const key=w.key(anchor,field);w.seed(anchor,key);assert.equal(Object.keys(store).length,0);
  await w.finish(anchor,true);assert.equal(store.choiceExperiences[key].length,2);
  assert.equal(await w.replay(anchor,field,'演示大学',layer),true);assert.equal(layer.querySelector('input').value,'演示');
  assert(!JSON.stringify(store).includes('演示'));
  await w.finish(anchor,false);assert.equal(store.choiceExperiences[key],undefined);
  w.seed(anchor,key);await w.finish(anchor,true);store.choiceExperiences[key].verifiedAt=0;
  assert.equal(await w.replay(anchor,field,'演示大学',layer),false);assert.equal(store.choiceExperiences[key],undefined);
  console.log('PASS experience: verified-only storage, parameter-only replay, failure eviction and expiry');
 }finally{w.close();}
}
async function range(rollback){
 const d=new JSDOM('<div class="ant-picker-range"><div class="ant-picker-input"><input></div><div class="ant-picker-input"><input></div></div>',{runScripts:'outside-only'}),w=d.window;
 w.eval('let activeFillRun=null;const openDateRanges=new WeakSet();function controlHasValue(el){return !!el.querySelector("input").value;}function checkFillRun(){}function comparePagePosition(){return 0;}function isVisible(){return true;}function auditInvalid(){return false;}function customControlMatchesValue(el,f,v){return el.querySelector("input").value===v;}async function wait(){}async function applyControl(el,f,values,o,s){el.querySelector("input").value=values[0];s.filled.push(f.label);if(window.rollback && f.key==="end")document.querySelector("input").value="";}'+cut('  async function executeFillPlan(','  async function applyControl(')+'window.execute=executeFillPlan;');
 w.rollback=rollback;
 try{
  const elements=Array.from(w.document.querySelectorAll('.ant-picker-input'));
  const plan=elements.map((el,i)=>({el,field:{key:i?'end':'start',label:i?'结束时间':'开始时间'},values:[i?'2026-08-01':'2026-07-01']}));
  const summary={filled:[],failed:[]};await w.execute(plan,true,summary,{});
  assert.equal(summary.filled.length,rollback?0:2);assert.equal(summary.failed.length,rollback?2:0);
  console.log('PASS date range '+(rollback?'rollback invalidates both endpoints':'both endpoints retained'));
 }finally{w.close();}
}
async function rangeTransaction(){
 const d=new JSDOM('<div class="ant-picker-range"><div class="ant-picker-input"><input></div><div class="ant-picker-input"><input></div></div><div id="layer"></div>',{runScripts:'outside-only'}),w=d.window;
 w.eval('let open=false,closes=0;function visibleChoiceLayers(){return open?[document.querySelector("#layer")]:[];}function ownedChoiceLayer(a,l){return l[0]||null;}async function dismissVisibleChoiceLayers(){closes++;open=false;const inputs=document.querySelectorAll("input");if(!inputs[1].value)inputs[0].value="";return true;}function safeCustomClick(e){e.click();open=true;return true;}async function wait(){}async function fillAntCalendar(a,l,m){a.querySelector("input").value=m[1]+"-"+m[2]+"-"+m[3];return true;}'+cut('  const openDateRanges =','  async function fillAntCalendar(')+'window.fill=fillCustomDate;window.count=()=>closes;');
 try{
  const anchors=w.document.querySelectorAll('.ant-picker-input');
  assert.equal(await w.fill(anchors[0],'2025-01-01'),true);assert.equal(w.count(),1);assert.equal(anchors[0].querySelector('input').value,'2025-01-01');
  assert.equal(await w.fill(anchors[1],'2026-01-01'),true);assert.equal(w.count(),2);assert.equal(anchors[0].querySelector('input').value,'2025-01-01');
  console.log('PASS range transaction: no close between start/end, committed pair retained');
 }finally{w.close();}
}
(async()=>{await routing();await experience();await range(false);await range(true);await rangeTransaction();})().catch(e=>{console.error(e);process.exitCode=1;});
