// Sanitized Hisense school autocomplete: remote candidates arrive after the old 180 ms wait.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});try{
 for(const mode of ['match','freeform','rollback']){
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<style>[hidden]{display:none!important}.phoenix-select,.form-item{width:300px;padding:12px}</style><div class="form-item"><div class="form-item__text">毕业学校</div><div class="phoenix-auto-complete-container"><input id="school"></div></div><div class="form-item"><div class="form-item__text">最高学历</div><div class="phoenix-select" id="degree"><span class="phoenix-select__singleValue"></span></div></div><div class="common-unmodeled-layer" id="schools" hidden></div><div class="common-unmodeled-layer" id="degrees" hidden><div class="phoenix-selectList__listItem">本科</div></div><button id="save">保存</button>`}));await page.goto('https://fixture.invalid/phoenix-auto');
 await page.evaluate(mode=>{
  window.saves=0;window.schoolChoices=0;const input=document.querySelector('#school'),layer=document.querySelector('#schools'),degree=document.querySelector('#degree'),degrees=document.querySelector('#degrees');
  input.oninput=()=>setTimeout(()=>{layer.innerHTML='<div class="phoenix-selectList__listItem">'+(mode==='freeform'?'无匹配的学校':'浙江大学')+'</div>';layer.hidden=false;layer.firstChild.onclick=()=>{schoolChoices++;layer.hidden=true;};},650);
  document.addEventListener('mousedown',e=>{if(e.target.closest('.form-item__text')){layer.hidden=true;if(mode==='rollback')input.value='';}});
  degree.onclick=()=>degrees.hidden=false;degrees.firstChild.onclick=()=>{degree.firstChild.textContent='本科';degrees.hidden=true;};document.querySelector('#save').onclick=()=>saves++;
  const store={profile:{school:'浙江大学',degree:'本科'},settings:{}};window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async()=>({ok:true})}};
  if(mode==='rollback')layer.addEventListener('click',()=>{input.value='';});
 },mode);
 for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
 const result=await page.evaluate(()=>new Promise(resolve=>listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve)));
 assert.equal(result.selfCheck.items.find(x=>x.fieldKey==='degree').status,'verified',JSON.stringify(result.selfCheck));
 assert.equal(result.selfCheck.items.find(x=>x.fieldKey==='school').status,mode==='rollback'?'failed':'verified');
 assert.equal(await page.locator('.common-unmodeled-layer:visible').count(),0);assert.equal(await page.evaluate(()=>saves),0);
 if(mode==='match')assert.equal(await page.evaluate(()=>schoolChoices),1);if(mode==='freeform')assert.equal(await page.evaluate(()=>schoolChoices),0);
 console.log('PASS Phoenix asynchronous autocomplete: '+mode);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
