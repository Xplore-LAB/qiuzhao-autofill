// Generated reports contain fixture data only. No connection to a user browser/account.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {JSDOM,VirtualConsole}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const root=path.resolve(__dirname,'../..');
const cases=[...['happy','missing-option','rollback'].map(id=>({id:'hisense/'+id,file:'hisense/controls.html',query:'?case='+id})),
  {id:'repeat-records',file:'repeat-records-harness.html'},
  {id:'dates-and-controls',file:'v1.4-harness.html'},
  {id:'delayed-choice',file:'choice-verification-harness.html'}];
const output=path.resolve(process.env.QIUZHAO_REPORT_DIR||path.join(__dirname,'reports'));
const source=fs.readFileSync(path.join(root,'content/content.js'),'utf8');
const report={at:new Date().toISOString(),engine:'jsdom (no real browser layout or server persistence)',version:JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),cases:[]};
async function run(item){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>{if(!/Not implemented: window.scrollTo/.test(e.message))errors.push(String(e));});
 const file=path.join(root,'test',item.file),start=Date.now();
 const dom=await JSDOM.fromFile(file,{url:pathToFileURL(file).href+(item.query||''),runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.CSS={escape:s=>String(s).replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c)};w.HTMLElement.prototype.scrollIntoView=function(){};
  // Explicit simulation, not proof of real layout or SVG hit-testing.
  for(const proto of [w.HTMLElement.prototype,w.SVGElement.prototype])proto.getBoundingClientRect=function(){let visible=this.isConnected;for(let p=this;p;p=p.parentElement){const s=w.getComputedStyle(p);if(p.hidden||s.display==='none'||s.visibility==='hidden')visible=false;}return {top:0,left:0,width:visible?100:0,height:visible?20:0,right:100,bottom:20};};
 }});
 try{
  while(Date.now()-start<60000){
   if(errors.length)throw Error(errors.join('\n'));
   const detail=dom.window.__hisenseReport;
   const text=dom.window.document.querySelector('#result,#testStatus,output')?.textContent||'';
   if(detail||/^(通过|测试通过|PASS|控件回归通过：true|失败|测试失败|FAIL|控件回归通过：false)/.test(text)){
    const result={...detail,id:item.id,pass:detail?detail.pass:/^(通过|测试通过|PASS|控件回归通过：true)/.test(text),ms:Date.now()-start};
    if(!detail)result.message=text;
    if(dom.window.__REPEAT_RESULT?.checks)result.checks=dom.window.__REPEAT_RESULT.checks;
    if(!result.pass){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,item.id.replaceAll('/','-')+'.failure.html'),dom.serialize());}
    return result;
   }
   await new Promise(r=>setTimeout(r,100));
  }
  throw Error('60 second deadline exceeded');
 }catch(e){return {id:item.id,pass:false,error:String(e),ms:Date.now()-start};}finally{dom.window.close();}
}
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 let previous;try{previous=JSON.parse(fs.readFileSync(path.join(output,'latest.json'),'utf8'));}catch{}
 for(const item of cases){const result=await run(item);report.cases.push(result);console.log(`${result.pass?'PASS':'FAIL'} ${item.id} ${(result.ms/1000).toFixed(1)}s`);}
 report.pass=report.cases.every(c=>c.pass);
 report.changes=report.cases.map(c=>{const old=previous?.cases.find(p=>p.id===c.id);return {id:c.id,status:!old?'new':old.pass===c.pass?'unchanged':c.pass?'fixed':'regression'};});
 const json=JSON.stringify(report,null,2);fs.writeFileSync(path.join(output,'latest.json'),json);
 fs.writeFileSync(path.join(output,report.at.replace(/[:.]/g,'-')+'.json'),json);
 const sections=report.cases.map(c=>`<h2>${esc(c.id)} · ${c.pass?'PASS':'FAIL'}</h2><p>${esc(c.error||c.message||'')}</p><table><tr><th>检查项</th><th>预期</th><th>实际</th><th>结果</th></tr>${(c.checks||[]).map(k=>`<tr><td>${esc(k.id)}</td><td>${esc(JSON.stringify(k.expected))}</td><td>${esc(JSON.stringify(k.actual))}</td><td>${k.pass?'通过':'失败'}</td></tr>`).join('')}</table>`).join('');
 fs.writeFileSync(path.join(output,'latest.html'),`<!doctype html><meta charset="utf-8"><title>海信基准报告</title><style>body{font:15px system-ui;max-width:1050px;margin:30px auto;padding:20px;color:#234}td,th{border:1px solid #ddd;padding:8px;text-align:left}table{border-collapse:collapse;width:100%}p{overflow-wrap:anywhere}</style><h1>海信基准：${report.pass?'通过':'有失败'}</h1><p>${esc(report.at)} · v${esc(report.version)}</p><p>引擎：${esc(report.engine)}。行为复现测试通过不代表真实网站验收通过。模拟保存仅验证本地模型恢复。</p><p>源码 SHA256：${esc(report.sourceSha256)}</p><p>变化：${esc(JSON.stringify(report.changes))}</p>${sections}`);
 console.log('Report: '+path.join(output,'latest.html'));if(!report.pass)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
