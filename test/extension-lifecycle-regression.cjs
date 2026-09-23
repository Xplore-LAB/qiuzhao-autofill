// Full production message lifecycle on synthetic forms; all network is intercepted.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{for(const mode of ['happy','rollback','replacement','concurrent','cancel','profile-unavailable']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<form><div class="form-item"><label>姓名</label><input id="name"></div><div class="form-item"><label>邮箱</label><input id="email"></div><div class="form-item"><label>手机号</label><input id="phone" value="13900000000"></div><div class="form-item"><label>出生日期</label><input id="birth" type="date"></div><button id="save">保存</button><button id="submit">提交</button></form>`}));
  await page.goto('https://fixture.invalid/lifecycle');
  await page.evaluate(mode=>{
   window.actions={inputs:0,save:0,submit:0};window.logs=[];
   document.querySelector('form').onsubmit=e=>{e.preventDefault();actions.submit++;};document.querySelector('#save').onclick=e=>{e.preventDefault();actions.save++;};
   document.addEventListener('input',()=>actions.inputs++);
   document.querySelector('#email').addEventListener('input',()=>{
    if(mode==='rollback')document.querySelector('#name').value='';
    if(mode==='replacement'){const next=document.querySelector('#name').cloneNode();next.value='';document.querySelector('#name').replaceWith(next);}
   });
   if(mode==='cancel')document.querySelector('#name').addEventListener('input',()=>window.request({type:'STOP_FILL'}),{once:true});
   const store={profile:{name:'演示姓名',email:'demo@example.com',phone:'13800000000'},settings:{},siteRules:{},learned:{}};
   window.chrome={storage:{local:{get:async()=>store,set:async data=>Object.assign(store,data)},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async m=>{if(m.type==='SAVE_RUN_LOG')logs.push(m.log);return {ok:mode!=='profile-unavailable'};}}};
   window.request=m=>new Promise(resolve=>window.listener(m,null,resolve));
  },mode);
  for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
  assert.equal((await page.evaluate(()=>request({type:'PING'}))).contentBuild,JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version+'-dev');
  const results=await page.evaluate(async mode=>{const m={type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false};return mode==='concurrent'?Promise.all([request(m),request(m)]):[await request(m)];},mode);
  const result=results[0],status=await page.evaluate(()=>request({type:'GET_FILL_STATUS'}));
  assert.equal(status.running,false);
  if(['happy','concurrent'].includes(mode)){
   assert.equal(result.selfCheck.items.filter(i=>i.status==='verified').length,2);
   assert.equal(result.selfCheck.items.find(i=>i.fieldKey==='phone').reason,'existing-unverified');
   assert(result.selfCheck.items.some(i=>i.status==='missing'));
   if(mode==='concurrent'){
    assert.deepEqual(results[0],results[1]);
    assert.equal(await page.evaluate(()=>new Set(logs.map(l=>l.runId)).size),1,'concurrent clicks share one run');
   }else{
    const count=await page.evaluate(()=>actions.inputs);
    await page.evaluate(()=>request({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false}));
    assert.equal(await page.evaluate(()=>actions.inputs),count,'rerun cannot overwrite existing values');
   }
  }else if(mode==='cancel'){
   assert.equal(result.note,'fill-cancelled');assert.equal(await page.locator('#email').inputValue(),'');
  }else if(mode==='profile-unavailable'){
   assert.equal(result.note,'fill-error');assert.equal(await page.evaluate(()=>actions.inputs),0);
  }else{
   assert.equal(result.selfCheck.items.filter(i=>i.fieldKey==='name'&&i.status==='verified').length,0,'later interaction invalidates prior success');
   assert.equal(await page.locator('#name').inputValue(),'');
  }
  assert.equal(await page.locator('#phone').inputValue(),'13900000000');
  assert.deepEqual(await page.evaluate(()=>[actions.save,actions.submit]),[0,0]);assert.deepEqual(errors,[]);
  const logs=await page.evaluate(()=>JSON.stringify(logs));
  for(const secret of ['demo@example.com','演示姓名','13900000000','expectedValues'])assert(!logs.includes(secret),'no profile values in logs');
  console.log('PASS extension lifecycle: '+mode);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
