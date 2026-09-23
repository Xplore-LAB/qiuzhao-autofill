const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
const start=source.indexOf('  function requiresLongSettlement('),end=source.indexOf('\n  async function prepareExecutablePagePlan()',start);
const make=(tag,type,classes='')=>({tagName:tag,type,getAttribute:()=>null,closest:selector=>classes&&selector.includes(classes)?{}:null});
async function delaysFor(el){
  const waits=[],context={isCustomSelect:()=>false,isCustomRadioGroup:()=>false,isAutocompleteInput:()=>false,inputType:node=>node.type||'',wait:async ms=>waits.push(ms),auditValue:()=>'',traceStep:()=>{}};
  vm.createContext(context);vm.runInContext(source.slice(start,end)+'\nthis.observe=observeRunSettlement;',context);
  await context.observe({auditRecords:[{el,verified:true,skipped:false,after:'',field:{}}]});return waits;
}
(async()=>{
  assert.deepEqual(await delaysFor(make('INPUT','text')),[450]);
  assert.deepEqual(await delaysFor(make('TEXTAREA','')),[450]);
  assert.deepEqual(await delaysFor(make('INPUT','date')),[500,1500,3000]);
  assert.deepEqual(await delaysFor(make('INPUT','text','ant-select')),[500,1500,3000]);
  console.log('PASS settlement speed: native fields use one quiet-window read; stateful widgets retain delayed rollback checks');
})().catch(error=>{console.error(error);process.exitCode=1;});
