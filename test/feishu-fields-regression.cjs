// Minimal sanitized field structure observed on xiaopeng.jobs.feishu.cn.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{
  const page=await browser.newPage();
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<div class="ud-formily-item" data-form-field-i18n-name="姓名"><div class="ud-formily-item-label">姓名 *</div><div class="ud-formily-item-control"><label class="ud__input-input-wrap"><input class="ud__native-input" data-form-field-i18n-name="姓名" id="fixture-one"></label></div></div><div class="ud-formily-item" data-form-field-i18n-name="邮箱"><div class="ud-formily-item-label">邮箱 *</div><div class="ud-formily-item-control"><label class="ud__input-input-wrap"><input class="ud__native-input" id="fixture-two"></label></div></div><button id="done">完成</button>`}));
  await page.goto('https://fixture.invalid/feishu');
  await page.evaluate(()=>{
   window.actions=0;document.querySelector('#done').onclick=()=>actions++;
   const store={profile:{name:'演示姓名',email:'demo@example.com'},settings:{}};
   window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async()=>({ok:true})}};
  });
  for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
  const result=await page.evaluate(()=>new Promise(resolve=>listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve)));
  assert.equal(result.selfCheck?.counts.verified,2,'observed Formily labels must map both native controls: '+JSON.stringify(result.selfCheck));
  assert.equal(await page.locator('#fixture-one').inputValue(),'演示姓名');
  assert.equal(await page.locator('#fixture-two').inputValue(),'demo@example.com');
  await page.evaluate(()=>new Promise(resolve=>listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve)));
  assert.equal(await page.locator('#fixture-one').inputValue(),'演示姓名');
  assert.equal(await page.evaluate(()=>actions),0);
  console.log('PASS Feishu observed field labels: nested native input, container label, existing value, no completion click');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
