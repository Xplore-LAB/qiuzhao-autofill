const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {validate}=require('../shared/page-plan');
const input={controls:[{id:'0'},{id:'1'}],sections:[{id:'0'}],fields:[{key:'name'}]};
const valid={controls:[{id:'0',status:'mapped',fieldKey:'name',confidence:.95}],sections:[{id:'0',status:'classified',category:'awardsBulk',confidence:.95}]};
let plan=validate(valid,input);
assert.equal(plan.controls[0].fieldKey,'name');assert.equal(plan.controls[1].status,'review');
assert.equal(plan.sections[0].category,'awardsBulk');
for(const item of [{id:'0',status:'mapped',fieldKey:'unknown',confidence:1},{id:'0',status:'mapped',fieldKey:'name',confidence:.5},{id:'0',status:'mapped',fieldKey:'name'}])
  assert.equal(validate({...valid,controls:[item]},input).controls[0].status,'review');
assert.equal(validate({...valid,controls:[valid.controls[0],valid.controls[0]]},input).controls[0].status,'review');
assert.equal(validate({...valid,sections:[{id:'0',status:'classified',category:'certificate',confidence:1}]},input).sections[0].status,'review');
assert.throws(()=>validate({},input),/invalid-page-plan/);
assert(!JSON.stringify(validate({...valid,controls:[{...valid.controls[0],value:'PRIVATE',selector:'body',code:'evil()'}]},input)).includes('PRIVATE'));
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
const cut=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));
(async()=>{
  const el={required:false,getAttribute:()=>null,isConnected:true};let response={ok:true,plan};
  const context={activeFillRun:{},REPEAT_GROUPS:[],FIELDS:[{key:'name',label:'姓名'}],
    observePlanSections:()=>[],repeatSectionRoot:()=>null,collectControls:()=>[el],
    bestLabelTextFrom:()=> '姓名',getTextCandidates:()=>[],aiControlKind:()=> 'text',controlHasValue:()=>false,
    diagnosticAiRequest:async()=>response,checkFillRun(){},traceStep(){}};
  vm.createContext(context);vm.runInContext(cut('  async function prepareExecutablePagePlan()', '  async function runManualFill('),context);
  await context.prepareExecutablePagePlan();assert.equal(context.activeFillRun.pageDecisions.get(el).fieldKey,'name');
  response={ok:false};await assert.rejects(context.prepareExecutablePagePlan(),/page-plan-unavailable/);
  response={ok:true,plan:{controls:[],sections:[]}};await context.prepareExecutablePagePlan();assert.equal(context.activeFillRun.pageDecisions.get(el).status,'review');
  context.collectControls=()=>Array(121).fill(el);await assert.rejects(context.prepareExecutablePagePlan(),/capacity-exceeded/);
  vm.runInContext(cut('  async function applyControl(', '  function rulesForHost('),context);
  const tasks=[];await context.applyControl(el,{key:'name'},'演示姓名',false,{},{plan:tasks});assert.equal(tasks.length,0);
  context.activeFillRun.pageDecisions.set(el,{status:'mapped',fieldKey:'name'});
  await context.applyControl(el,{key:'phone'},'演示电话',false,{},{plan:tasks});assert.equal(tasks.length,0);
  await context.applyControl(el,{key:'name'},'演示姓名',false,{},{plan:tasks});assert.equal(tasks.length,1);
  let count=0,clicks=0;const root={querySelector:()=>null},add={};
  context.repeatControlCount=()=>count;context.repeatSectionRoot=()=>root;context.repeatAddControl=()=>add;
  context.dismissVisibleChoiceLayers=async()=>{};context.safeCustomClick=target=>{assert.equal(target,add);clicks++;count++;return true;};
  context.waitForRepeatCount=async()=>count;
  vm.runInContext(cut('  async function ensureRepeatedRows(', '  function repeatRowRoots('),context);
  context.activeFillRun.pageSectionDecisions=[{root,status:'classified',category:'awardsBulk'}];
  let rows=await context.ensureRepeatedRows({label:'竞赛获奖',bulkKey:'awardsBulk'},2);
  assert.equal(rows.added,2);assert.equal(clicks,2);assert.equal(rows.reason,'records-ready');
  await context.ensureRepeatedRows({label:'竞赛获奖',bulkKey:'awardsBulk'},2);assert.equal(clicks,2);
  context.activeFillRun.pageSectionDecisions=[{root,status:'review'}];
  rows=await context.ensureRepeatedRows({label:'竞赛获奖',bulkKey:'awardsBulk'},3);assert.equal(rows.reason,'section-needs-review');assert.equal(clicks,2);
  context.activeFillRun.pageSectionDecisions=[{root,status:'classified',category:'projectsBulk'}];
  rows=await context.ensureRepeatedRows({label:'竞赛获奖',bulkKey:'awardsBulk'},3);assert.equal(rows.added,0);assert.equal(clicks,2);
  console.log('PASS page plan: whitelist, duplicates, missing decisions, no model values/scripts, fail closed, capacity, execution veto');
  console.log('PASS planned record tool: two additions, count verification, no repeated addition, review/category veto');
})().catch(error=>{console.error(error);process.exitCode=1;});
