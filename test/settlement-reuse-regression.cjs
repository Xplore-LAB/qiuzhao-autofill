// Fake-clock regression against production settlement and final-check functions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
async function scenario(mode){
 let now=0,open=false;const waits=[],events=[];
 const el={tagName:'DIV',isConnected:true,value:'本科',getAttribute:()=>null,closest:()=>null};
 const field={key:'degree',label:'学历',type:'choice'},record={el,field,after:'本科',expectedValues:['本科'],verified:true};
 const run={auditRecords:[record],phase:'self-check'};
 const ctx={Date:class extends Date {static now(){return now;}},activeFillRun:run,lastSelfCheck:null,FIELDS:[field],
  isCustomSelect:()=>true,isCustomRadioGroup:()=>false,isAutocompleteInput:()=>false,isRadio:()=>false,inputType:()=>'',
  visibleChoiceLayers:()=>open?[{}]:[],dismissVisibleChoiceLayers:async()=>{if(open){open=false;el.value='硕士';}},
  auditValue:()=>el.value,auditInvalid:()=>false,isVisible:()=>true,collectControls:()=>[],controlHasValue:()=>!!el.value,
  customControlMatchesValue:(_el,_field,target)=>el.value===target,
  traceStep:(stage)=>events.push({stage,at:now}),wait:async ms=>{
   waits.push(ms);now+=ms;
   // A slow business rollback near the end of the existing five-second window.
   if((mode==='late-rollback'&&now>=4800)||(mode==='final-readback-rollback'&&now>=5200))el.value='';
   if(mode==='replacement'&&now>=4800)el.isConnected=false;
  }};
 vm.createContext(ctx);
 vm.runInContext(source.slice(source.indexOf('  function auditMatchesTarget('),source.indexOf('  function comparePagePosition(')),ctx);
 vm.runInContext(source.slice(source.indexOf('  function requiresLongSettlement('),source.indexOf('  async function runAutoFill(')),ctx);
 if(mode!=='missing-observation')await ctx.observeRunSettlement(run);
 if(mode==='changed-after-observation')el.value='硕士';
 if(mode==='reopened')open=true;
 const observedAt=now;
 const result=await ctx.runSelfCheck({});
 if(mode==='stable'){
  assert.equal(result.items[0].status,'verified');
  assert.equal(observedAt,5000,'retain the whole delayed rollback window');
  assert.equal(now-observedAt,400,'a closed, unchanged control must not pay another 800 ms');
 } else if(mode==='missing-observation')assert.equal(now,1200,'without observation evidence keep the original component wait');
 else {
  assert.notEqual(result.items[0].status,'verified',mode+' cannot be a success');
  if(mode==='reopened'||mode==='changed-after-observation')assert.equal(now-observedAt,1200,'new interaction or change invalidates reusable observation');
 }
 console.log('PASS settlement reuse: '+mode+' ('+now+' ms virtual time)');
}
(async()=>{for(const mode of ['stable','missing-observation','changed-after-observation','reopened','late-rollback','final-readback-rollback','replacement'])await scenario(mode);})().catch(e=>{console.error(e);process.exitCode=1;});
