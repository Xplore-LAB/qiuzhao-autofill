// Synthetic evidence from the Kuaishou live trial: related labels must not swap values.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../content/content.js'),'utf8');
const begin=source.indexOf('    // 4) 自定义字段'),end=source.indexOf('    // 5) 学习记录',begin);
assert(begin>=0&&end>begin);
const helperStart=source.indexOf('  function customMatchScore(');
const helperEnd=source.indexOf('\n  function ',helperStart+4);
const helpers=helperStart<0?'':source.slice(helperStart,helperEnd);
async function run(labels,customs,usedIndices=[]){
 const controls=labels.map((label,id)=>({id}));
 const texts=new Map(controls.map((el,i)=>[el,labels[i]]));
 const writes=[];
 const ctx={controls,texts,customs,used:new Set(usedIndices.map(i=>controls[i])),overwrite:false,summary:{},opts:{},
  normalize:s=>String(s||'').replace(/[\s*：:]/g,'').toLowerCase(),
  applyControl:async(el,field,value)=>writes.push({id:el.id,label:field.label,value})};
 vm.createContext(ctx);
 await vm.runInContext(helpers+'\n(async()=>{'+source.slice(begin,end)+'})()',ctx);
 return writes;
}
const name={label:'紧急联系人',value:'演示联系人'},phone={label:'紧急联系人电话',value:'13900000000'};
const pair=[[{text:'紧急联系人 *',w:10},{text:'请输入紧急联系人',w:5}],[{text:'紧急联系人电话 *',w:10},{text:'请输入紧急联系人电话',w:5}]];
(async()=>{
 assert.deepEqual(await run(pair,[name,phone]),[{id:0,...name},{id:1,...phone}],'Name must target the name field, telephone the telephone field');
 assert.deepEqual(await run(pair,[phone,name]),[{id:1,...phone},{id:0,...name}],'Source order must not change binding');
 assert.deepEqual(await run([pair[1]],[name]),[],'A missing name field must not fall back to the phone field');
 assert.deepEqual(await run([pair[0]],[phone]),[],'A missing phone field must not fall back to the name field');
 assert.deepEqual(await run([pair[0],pair[0]],[name]),[],'Ambiguous repeated labels must be left for review');
 assert.deepEqual(await run(pair,[name,phone],[0]),[{id:1,...phone}],'A reserved name field must not redirect the name into the phone field');
 assert.deepEqual(await run([[{text:'请输入紧急联系人电话',w:5}]],[phone]),[{id:0,...phone}],'Exact placeholder wording may be used when no explicit label exists');
 assert.deepEqual(await run([[{text:'紧急联系人电话',w:10},{text:'紧急联系人',w:2}]],[name]),[],'Nearby text must not override an explicit different label');
 console.log('PASS custom field matching: no name/phone swaps, no substring fallback, no ambiguous target, reserved controls protected');
})().catch(error=>{console.error(error);process.exitCode=1;});
