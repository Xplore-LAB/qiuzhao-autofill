// DOM integration test, not a real-browser compatibility claim.
const {JSDOM, VirtualConsole}=require(process.env.QIUZHAO_JSDOM || 'jsdom');
const path=require('node:path');
async function run(name) {
  const errors=[];
  const output=new VirtualConsole();output.on('jsdomError',e=>{if(!/Not implemented: window.scrollTo/.test(e.message))errors.push(e.message);});
  const dom=await JSDOM.fromFile(path.join(__dirname,name),{runScripts:'dangerously',resources:'usable',pretendToBeVisual:true,virtualConsole:output,beforeParse(window){
    window.CSS={escape:value=>String(value).replace(/[^a-zA-Z0-9_-]/g,c=>'\\'+c)};
    window.HTMLElement.prototype.scrollIntoView=function(){};
    window.HTMLElement.prototype.getBoundingClientRect=function(){
      let visible=this.isConnected;
      for(let p=this;p;p=p.parentElement){const s=window.getComputedStyle(p);if(p.hidden||s.display==='none'||s.visibility==='hidden')visible=false;}
      return {top:0,left:0,width:visible?100:0,height:visible?20:0,bottom:20,right:100};
    };
  }});
  const deadline=Date.now()+45000;
  try {
    while(Date.now()<deadline){
      const text=dom.window.document.querySelector('#result,#testStatus,output')?.textContent||'';
      if(/通过|失败|PASS|FAIL/.test(text)){
        console.log(name,text.slice(0,2500));
        if(!/^(通过|测试通过|PASS|控件回归通过：true)/.test(text)||errors.length)throw Error(errors.join('\n')||'fixture failed');
        return;
      }
      if(errors.length)throw Error(errors.join('\n'));
      await new Promise(r=>setTimeout(r,100));
    }
    throw Error(name+' timed out');
  } finally {dom.window.close();}
}
(async()=>{for(const name of ['choice-verification-harness.html','repeat-records-harness.html','v1.4-harness.html'])await run(name);})().catch(e=>{console.error(e);process.exitCode=1;});
