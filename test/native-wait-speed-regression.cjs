// Production scripts, isolated synthetic forms, no external network or real profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try { for(const mode of ['ready','blur-rollback','blur-replaced','linked','late-rollback','stop']) {
  const page=await browser.newPage();
  const fields=[['name','姓名'],['email','邮箱'],['phone','手机号'],['wechat','微信号'],['height','身高'],['weight','体重']];
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<form>'+fields.map(([id,label])=>`<div class="form-item"><label for="${id}">${label}</label><input id="${id}"></div>`).join('')+'<button id="save">保存</button></form>'}));
  await page.goto('https://fixture.invalid/native');
  await page.evaluate(mode=>{
   window.logs=[];window.actions={save:0,secondInputName:null};
   document.querySelector('form').onsubmit=e=>{e.preventDefault();actions.save++;};
   const name=document.querySelector('#name');
   name.onblur=()=>{
    if(mode==='blur-rollback'||mode==='late-rollback')setTimeout(()=>name.value='',mode==='late-rollback'?800:80);
    if(mode==='blur-replaced')setTimeout(()=>{const next=name.cloneNode();next.value='';name.replaceWith(next);},80);
    if(mode==='linked')setTimeout(()=>document.querySelector('#email').value='linked@example.com',80);
   };
   document.querySelector('#email').oninput=()=>actions.secondInputName=document.querySelector('#name').value;
   if(mode==='stop')name.oninput=()=>listener({type:'STOP_FILL'},null,()=>{});
   const store={profile:{name:'演示姓名',email:'demo@example.com',phone:'13800000000',wechat:'demo_wechat',height:'175',weight:'65'},settings:{}};
   window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async m=>{if(m.type==='SAVE_RUN_LOG')logs.push(m.log);return {ok:true};}}};
  },mode);
  for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
  const result=await page.evaluate(()=>new Promise(resolve=>listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve)));
  const state=await page.evaluate(()=>({actions,log:logs.at(-1)}));
  assert.equal(state.actions.save,0);
  if(mode==='ready'){
   assert.equal(result.selfCheck.counts.verified,6,JSON.stringify(result));
   const start=state.log.events.find(e=>e.stage==='task-start');
   const end=state.log.events.filter(e=>e.stage==='blur-check').at(-1);
   assert(end,'post-blur verification remains observable');
   const elapsed=end.ms-start.ms;
   console.log('Six native controls: '+elapsed+' ms');
   assert(elapsed<1100,'six plain controls should not pay both 100 and 120 ms waits: '+elapsed);
  } else if(mode==='stop'){
   assert.equal(result.note,'fill-cancelled');assert.equal(await page.locator('#email').inputValue(),'');
  } else if(mode==='linked'){
   assert.equal(await page.locator('#email').inputValue(),'linked@example.com','wait for blur linkage before deciding whether next field is empty');
   assert.equal(state.actions.secondInputName,null,'do not overwrite linked content');
   assert.equal(result.selfCheck.items.find(i=>i.fieldKey==='email').reason,'existing-unverified');
  } else {
   const item=result.selfCheck.items.find(i=>i.fieldKey==='name');
   assert.notEqual(item?.status,'verified',mode+' cannot count as successful');
   assert.equal(item?.reason,mode==='blur-replaced'?'control-replaced':'value-reverted');
   if(mode!=='late-rollback')assert.equal(state.actions.secondInputName,'','blur changes must settle before next write');
  }
  const exported=JSON.stringify(state.log);
  for(const secret of ['演示姓名','demo@example.com','demo_wechat','linked@example.com'])assert(!exported.includes(secret));
  console.log('PASS native wait: '+mode);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
