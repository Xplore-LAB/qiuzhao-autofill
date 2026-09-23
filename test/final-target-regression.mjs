import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../content/content.js',import.meta.url),'utf8');
async function check(value,expected,{verified=true,skipped=false,type='text',custom=false}={}){
 const el={isConnected:true,tagName:'INPUT',value,closest:()=>null,getAttribute:()=>null};
 const field={key:'demo',label:'演示字段',type};
 const record={el,field,verified,skipped,after:value,expectedValues:[expected]};
 const ctx={activeFillRun:{auditRecords:[record]},lastSelfCheck:null,FIELDS:[field],visibleChoiceLayers:()=>[],dismissVisibleChoiceLayers:async()=>true,isCustomSelect:()=>custom,isCustomRadioGroup:()=>false,isRadio:()=>false,wait:async()=>{},auditValue:()=>value,auditInvalid:()=>false,isVisible:()=>true,collectControls:()=>[],controlHasValue:()=>!!value,customControlValueTexts:()=>value?[value]:[],customControlMatchesValue:(_el,_field,target)=>value===target};
 vm.createContext(ctx);
 const helper=source.indexOf('  function auditMatchesTarget(');
 if(helper>=0)vm.runInContext(source.slice(helper,source.indexOf('  async function runSelfCheck(')),ctx);
 vm.runInContext(source.slice(source.indexOf('  async function runSelfCheck('),source.indexOf('  function comparePagePosition('))+';this.run=runSelfCheck;',ctx);
 return (await ctx.run({})).items[0];
}
assert.equal((await check('','2020-09',{type:'date'})).status,'failed','stable empty cannot verify');
assert.equal((await check('wrong','expected')).status,'failed','stable wrong value cannot verify');
assert.equal((await check('expected','expected')).status,'verified');
assert.equal((await check('2020年09月','2020-09',{type:'date',custom:true})).status,'verified');
assert.equal((await check('2020-09-02','2020-09-01',{type:'date',custom:true})).status,'failed');
assert.equal((await check('2020-13','2020-13',{type:'date',custom:true})).status,'failed','invalid month cannot verify');
assert.equal((await check('2021-02-29','2021-02-29',{type:'date',custom:true})).status,'failed','invalid calendar date cannot verify');
assert.equal((await check('2020-02-29','2020-02-29',{type:'date',custom:true})).status,'verified');
assert.equal((await check('kept','expected',{skipped:true})).status,'manual');
assert.equal((await check('','expected',{verified:false})).reason,'not-verified');
console.log('PASS final target: empty, wrong, exact, normalized date, wrong day, preserved value, original failure');
