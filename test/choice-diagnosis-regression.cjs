const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
const dom=new JSDOM('<input><input><input><input><input>',{runScripts:'outside-only'}),w=dom.window,els=[...w.document.querySelectorAll('input')];
const reasons=['no-visible-options','no-matching-options','ambiguous-options'];
w.activeFillRun={auditRecords:els.map((el,i)=>({el,field:{label:'同名专业'},verified:i===3,after:'',failureReason:reasons[i]||'ambiguous-options',skipped:i===4}))};
w.dismissVisibleChoiceLayers=async()=>{};w.wait=async()=>{};w.auditValue=e=>e.value;w.isVisible=()=>true;w.auditInvalid=()=>false;w.collectControls=()=>els;w.visibleChoiceLayers=()=>[];
w.eval('let lastSelfCheck;'+source.slice(source.indexOf('  async function runSelfCheck('),source.indexOf('  function comparePagePosition('))+'window.check=runSelfCheck;');
(async()=>{try{
 const report=await w.check({});
 assert.deepEqual(Array.from(report.items.slice(0,3),i=>i.reason),reasons,'same-named controls keep their own execution failure');
 assert.equal(report.items[3].reason,'stable-match','recovered result overrides historical failure');
 assert.equal(report.items[4].reason,'existing-unverified','existing input remains protected');
 console.log('PASS exact choice failure survives final check without overriding recovered or skipped controls');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
