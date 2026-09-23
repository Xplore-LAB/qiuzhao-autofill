const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{for(const mode of ['happy','rollback','blocked','unrelated']){
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<style>.phoenix-select{padding:12px;width:240px} [hidden]{display:none!important}</style>
   <div class="form-item"><label>出生日期</label><div id="date" class="phoenix-select" aria-controls="calendar"><input readonly></div></div>
   <div class="form-item"><label>最高学历</label><div id="degree" class="phoenix-select" aria-controls="choices"><span class="phoenix-select__singleValue"></span></div></div>
   <div id="calendar" class="phoenix-date-picker" hidden><div class="phoenix-calendar-month-calendar"><span class="phoenix-calendar-month-panel-year-select-content">2020年</span><div class="phoenix-calendar-month-panel-cell"><span class="phoenix-calendar-month-panel-month">9月</span></div></div></div>
   <div id="choices" role="listbox" hidden><div role="option">本科</div></div><button id="save">保存</button>`}));
  await page.goto('https://fixture.invalid/form');
  await page.evaluate(mode=>{
   const date=document.querySelector('#date'),cal=document.querySelector('#calendar'),degree=document.querySelector('#degree'),choices=document.querySelector('#choices');
   window.actions={date:0,degree:0,save:0};window.logs=[];
   date.onclick=()=>{actions.date++;if(cal.hidden){cal.hidden=false;date.classList.add('phoenix-select--active');}else if(mode!=='blocked'){cal.hidden=true;date.classList.remove('phoenix-select--active');if(mode==='rollback')date.querySelector('input').value='';}};
   cal.querySelector('.phoenix-calendar-month-panel-month').onclick=()=>{date.querySelector('input').value='2020-09';};
   degree.onclick=()=>{actions.degree++;choices.hidden=false;};
   choices.querySelector('[role="option"]').onclick=()=>{degree.querySelector('span').textContent='本科';choices.hidden=true;};
   document.querySelector('#save').onclick=()=>actions.save++;
   if(mode==='unrelated'){cal.hidden=false;date.removeAttribute('aria-controls');}
   const store={profile:{birthDate:'2020-09',degree:'本科'},settings:{},siteRules:{},learned:{}};
   window.chrome={storage:{local:{get:async()=>store,set:async data=>Object.assign(store,data)},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async m=>{if(m.type==='SAVE_RUN_LOG')logs.push(m.log);return {ok:true};}}};
  },mode);
  for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
  const result=await page.evaluate(()=>new Promise(resolve=>listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve)));
  assert.equal(result.note,undefined,JSON.stringify(result));
  const date=result.selfCheck.items.find(i=>i.fieldKey==='birthDate'),degree=result.selfCheck.items.find(i=>i.fieldKey==='degree');
  if(mode==='happy'){assert.equal(date.status,'verified');assert.equal(degree.status,'verified');assert.equal(await page.locator('#calendar').isVisible(),false);}
  if(mode==='rollback'){assert.equal(date.status,'failed');assert.equal(degree.status,'verified');assert.equal(await page.locator('#date input').inputValue(),'');}
  if(mode==='blocked'){assert.equal(date.reason,'choice-layer-close-blocked');assert.equal(await page.evaluate(()=>actions.date),2);assert.equal(await page.evaluate(()=>actions.degree),0);}
  if(mode==='unrelated'){assert.equal(await page.evaluate(()=>actions.date),0);assert.equal(await page.evaluate(()=>actions.degree),0);}
  assert.equal(await page.evaluate(()=>actions.save),0);assert.deepEqual(errors,[]);
  assert(!JSON.stringify(await page.evaluate(()=>logs)).includes('expectedValues'),'target values must not enter persisted logs');
  console.log('PASS Phoenix local browser: '+mode);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
