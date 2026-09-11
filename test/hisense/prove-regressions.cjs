// Mutation tests: replace resource text in memory only; never edit production source.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,ResourceLoader,VirtualConsole}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../../content/content.js'),'utf8');
const variants=[
 {id:'wrong-search-input',old:"if (layer && layer.querySelectorAll) inputs.push(...layer.querySelectorAll(selector));\n    if (anchor && anchor.querySelectorAll) inputs.push(...anchor.querySelectorAll(selector));",replacement:"if (anchor && anchor.querySelectorAll) inputs.push(...anchor.querySelectorAll(selector));\n    if (layer && layer.querySelectorAll) inputs.push(...layer.querySelectorAll(selector));",failure:'politicalStatus.model'},
 {id:'outer-area-click',old:"match.el.querySelector('.icon-container svg') || match.el.querySelector('.icon-container')",replacement:"match.el.querySelector('.icon-container svg,.icon-container')",failure:'household.model'}
];
(async()=>{
 for(const v of variants){
  assert(source.includes(v.old),'mutation anchor missing: '+v.id);
  class Loader extends ResourceLoader{fetch(url,options){if(new URL(url).pathname.endsWith('/content/content.js'))return Promise.resolve(Buffer.from(source.replace(v.old,v.replacement)));return super.fetch(url,options);}}
  const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(String(e)));
  const dom=await JSDOM.fromFile(path.join(__dirname,'controls.html'),{runScripts:'dangerously',resources:new Loader(),pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
   w.CSS={escape:s=>String(s)};w.HTMLElement.prototype.scrollIntoView=function(){};
   for(const proto of [w.HTMLElement.prototype,w.SVGElement.prototype])proto.getBoundingClientRect=function(){let visible=this.isConnected;for(let p=this;p;p=p.parentElement){if(w.getComputedStyle(p).display==='none'||p.hidden)visible=false;}return {top:0,left:0,width:visible?100:0,height:visible?20:0,right:100,bottom:20};};
  }});
  try{
   const deadline=Date.now()+20000;while(!dom.window.__hisenseReport&&Date.now()<deadline&&!errors.length)await new Promise(r=>setTimeout(r,100));
   assert.deepEqual(errors,[]);const result=dom.window.__hisenseReport;assert(result,'fixture timed out');
   assert.equal(result.pass,false);assert.equal(result.checks.find(c=>c.id===v.failure)?.pass,false,'fixture must catch targeted defect');
   console.log('PASS mutation detected: '+v.id+' -> '+v.failure);
  }finally{dom.window.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
