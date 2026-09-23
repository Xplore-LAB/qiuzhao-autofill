// Exercise production content scripts in an isolated browser, including late rollback.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try { for(const mode of ['animated','ready','delayed','rollback','replaced','stop']) {
  const page=await browser.newPage();
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<style>.ant-select{padding:12px;width:240px}[hidden]{display:none!important}</style><div class="ant-form-item"><label>最高学历</label><div id="degree" class="ant-select" aria-controls="choices"><div class="ant-select-selector"><span class="ant-select-selection-item"></span></div></div></div><div id="choices" class="ant-select-dropdown" role="listbox" hidden><div role="option">本科</div></div><button id="save">保存</button>'}));
  await page.goto('https://fixture.invalid/form');
  await page.evaluate(mode=>{
   const anchor=document.querySelector('#degree'),layer=document.querySelector('#choices'),option=layer.firstElementChild;
   window.actions={open:0,select:0,save:0}; window.logs=[]; let closeTimer;
   anchor.onclick=()=>{actions.open++;clearTimeout(closeTimer);setTimeout(()=>layer.hidden=false,mode==='delayed'||mode==='stop'?700:0);};
   option.onclick=()=>{actions.select++;setTimeout(()=>{anchor.querySelector('span').textContent='本科';if(mode==='animated')closeTimer=setTimeout(()=>layer.hidden=true,300);else layer.hidden=true;
    if(mode==='rollback')setTimeout(()=>anchor.querySelector('span').textContent='',800);
    if(mode==='replaced')anchor.replaceWith(anchor.cloneNode(true));
   },mode==='delayed'?450:0);};
   document.querySelector('#save').onclick=()=>actions.save++;
   const store={profile:{degree:'本科'},settings:{}};
   window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async msg=>{if(msg.type==='SAVE_RUN_LOG')logs.push(msg.log);return {ok:true};}}};
  },mode);
  for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
  const result=await page.evaluate(mode=>new Promise(resolve=>{
   listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve);
   if(mode==='stop')setTimeout(()=>listener({type:'STOP_FILL'},null,()=>{}),100);
  }),mode);
  const item=result.selfCheck?.items.find(i=>i.fieldKey==='degree');
  const state=await page.evaluate(()=>({actions,log:logs.at(-1)}));
  assert.equal(state.actions.save,0);assert.ok(state.actions.select<=1,'do not toggle selection twice');
  if(mode==='ready'||mode==='delayed'||mode==='animated'){
   assert.equal(item?.status,'verified',JSON.stringify(result));assert.equal(await page.locator('#choices').isVisible(),false);
   const start=state.log.events.find(e=>e.stage==='task-start'),end=state.log.events.find(e=>e.stage==='write-result');
   const elapsed=end.ms-start.ms;
   console.log(mode+' control time: '+elapsed+' ms');
   if(mode==='animated')assert.equal(state.actions.open,1,'never reopen a menu while its close animation runs');
   if(mode==='ready')assert.ok(elapsed<450,'ready Ant select must not pay fixed 630 ms waits; actual='+elapsed);
  } else if(mode==='stop')assert.equal(state.actions.select,0,'stop during open wait must prevent selection');
  else assert.notEqual(item?.status,'verified',mode+' must not be reported as success');
  console.log('PASS Ant condition wait: '+mode);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
