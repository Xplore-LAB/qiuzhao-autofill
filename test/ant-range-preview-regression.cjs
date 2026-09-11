// A pending Ant range can expose a provisional end value before it is committed.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
async function run(existing){
 const dom=new JSDOM('<div class="ant-picker-range"><div class="ant-picker-input"><input></div><div class="ant-picker-input"><input></div></div>',{runScripts:'outside-only'}),w=dom.window;
 const range=w.document.querySelector('.ant-picker-range'),els=[...range.children],inputs=[...range.querySelectorAll('input')];
 if(existing)inputs[1].value='2030-12-01';
 w.activeFillRun=null;w.openDateRanges=new WeakSet();w.checkFillRun=()=>{};w.isVisible=()=>true;w.wait=async()=>{};w.comparePagePosition=(a,b)=>els.indexOf(a)-els.indexOf(b);w.controlHasValue=e=>!!e.querySelector('input').value;w.auditInvalid=()=>false;w.customControlMatchesValue=(e,f,v)=>e.querySelector('input').value===v;
 const writes=[];
 w.applyControl=async(e,f,vs,overwrite,summary)=>{
  if(!overwrite&&w.controlHasValue(e)){summary.skipped++;return;}
  e.querySelector('input').value=vs[0];writes.push(f.key);summary.filled.push(f.label);
  if(e===els[0]){w.openDateRanges.add(range);if(!existing)inputs[1].value='2024-01-02';}
  else w.openDateRanges.delete(range);
 };
 w.eval(source.slice(source.indexOf('  async function executeFillPlan('),source.indexOf('  async function applyControl('))+'window.execute=executeFillPlan;');
 try{
  const plan=els.map((el,i)=>({el,field:{key:i?'end':'start',label:i?'end':'start'},values:[i?'2026-06-01':'2022-09-01']}));
  await w.execute(plan,false,{filled:[],failed:[],skipped:0},{});
  assert.equal(inputs[1].value,existing?'2030-12-01':'2026-06-01');
  assert.equal(writes.includes('end'),!existing,'complete own preview but preserve pre-existing end');
 }finally{w.close();}
}
(async()=>{await run(false);await run(true);console.log('PASS Ant range preview completion and existing-end protection');})().catch(e=>{console.error(e);process.exitCode=1;});
