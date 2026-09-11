const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
async function run(mode,selfCheck=true){
 const dom=new JSDOM('<div class="form-item"><label>姓名</label><input id="name"></div><div class="form-item"><label>邮箱</label><input id="email"></div>',{runScripts:'outside-only',pretendToBeVisual:true,url:'https://fixture.invalid/'});
 const w=dom.window;let listener;const logs=[];
 w.CSS={escape:s=>String(s)};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLElement.prototype.getBoundingClientRect=function(){return {top:0,left:0,width:this.isConnected?100:0,height:this.isConnected?20:0,right:100,bottom:20};};
 w.chrome={storage:{local:{get:async()=>({profile:{name:'演示用户'},settings:{autoFill:false},learned:{},siteRules:{}}),set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){listener=fn;}},sendMessage:async message=>{if(message.type==='SAVE_RUN_LOG'){logs.push(message.log);return {ok:true};}return {};}}};
 const input=w.document.querySelector('#name');
 if(mode==='skip')input.value='手填姓名';
 if(['rollback','late','invalid','replace'].includes(mode))input.addEventListener('input',()=>w.setTimeout(()=>{
  if(mode==='rollback'||mode==='late')input.value='';
  if(mode==='invalid')input.setAttribute('aria-invalid','true');
  if(mode==='replace')input.replaceWith(input.cloneNode());
 },mode==='late'?2500:600),{once:true});
 try{
  w.eval(source);
  const result=await new Promise(resolve=>listener({type:'FILL_FORM',overwrite:mode!=='skip',selfCheck},null,resolve));
  assert(logs.length>=2);assert.equal(new Set(logs.map(l=>l.runId)).size,1);assert.equal(result.logSaved,true);assert(!JSON.stringify(logs).includes('演示用户'));assert(logs.at(-1).items.some(i=>i.fieldKey==='name'));
  assert.equal(logs.at(-1).counts.empty,result.pageEmptyCount,'persisted final empty count must match returned page state');
  assert.equal(logs.at(-1).counts.nonempty,result.pageFilledCount,'persisted final nonempty count must match returned page state');
  assert(logs.at(-1).events.some(e=>e.stage==='task-start'));
  assert(logs.at(-1).events.some(e=>e.stage==='settlement-check'));
  if(mode==='late')assert(logs.at(-1).events.some(e=>e.stage==='settlement-check' && e.sameAsWritten===false));
  if(!selfCheck){assert.equal(result.filled.length,0);assert(result.failed.includes('姓名'));console.log('PASS ordinary fill rejects delayed rollback');return;}
  assert(result.selfCheck,JSON.stringify(result));
  const item=result.selfCheck.items.find(i=>i.label==='姓名');
  assert.equal(item.status,mode==='happy'?'verified':['skip','replace'].includes(mode)?'manual':'failed');
  assert.equal(result.selfCheck.persistence,'not-tested');
  assert.equal(item.fieldKey,'name','known field identity must survive final check');
  assert(!JSON.stringify(result.selfCheck).includes('演示用户'));
  const stored=await new Promise(resolve=>listener({type:'GET_SELF_CHECK'},null,resolve));assert.equal(stored.report,result.selfCheck);
  const locate=await new Promise(resolve=>listener({type:'LOCATE_SELF_CHECK',id:item.id},null,resolve));assert.equal(locate.ok,mode!=='replace');
  const invalidId=await new Promise(resolve=>listener({type:'LOCATE_SELF_CHECK',id:'not-a-field'},null,resolve));assert.equal(invalidId.ok,false);
  console.log('PASS self-check '+mode);
 }finally{dom.window.close();}
}
(async()=>{for(const mode of ['happy','rollback','late','invalid','replace','skip'])await run(mode);await run('rollback',false);})().catch(e=>{console.error(e);process.exitCode=1;});
