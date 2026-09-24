// Observed Phoenix control classes; synthetic timing, never a live site.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});try{
 for(const mode of ['ready','delayed','closing','confirm','rollback','late-rollback','linked-rollback','stop','month','month-delayed']){
  const page=await browser.newPage(),month=mode.startsWith('month');
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<style>[hidden]{display:none!important}.phoenix-select{padding:12px;width:240px}</style><div class="form-item"><label>${month?'出生日期':'最高学历'}</label><div class="phoenix-select" aria-controls="layer"><span class="phoenix-select__singleValue"></span></div></div><div id="layer" class="${month?'phoenix-date-picker':'common-unmodeled-layer'}" hidden>${month?'<div class="phoenix-calendar-month-calendar"><span class="phoenix-calendar-month-panel-year-select-content">2026年</span><button class="phoenix-calendar-month-panel-prev-year-btn">上一年</button><div class="phoenix-calendar-month-panel-cell"><span class="phoenix-calendar-month-panel-month">9月</span></div></div>':'<div class="phoenix-selectList__listItem" role="option">本科</div>'}${mode==='confirm'?'<button>确定</button>':''}</div>${mode==='linked-rollback'?'<div class="form-item"><label>邮箱</label><input id="email"></div>':''}<button id="save">保存</button>`}));
  await page.goto('https://fixture.invalid/phoenix-speed');
  await page.evaluate(({mode,month})=>{
   const a=document.querySelector('.phoenix-select'),layer=document.querySelector('#layer'),value=a.firstChild;
   window.actions={open:0,select:0,nav:0,confirm:0,save:0};window.logs=[];
   a.onclick=()=>{actions.open++;setTimeout(()=>layer.hidden=!layer.hidden,mode==='delayed'||mode==='stop'?650:0);};
   a.onkeydown=e=>{if(e.key==='Escape')layer.hidden=true;};
   const commit=()=>{value.textContent=month?'2019-09':'本科';setTimeout(()=>layer.hidden=true,mode==='closing'?300:0);if(['rollback','late-rollback'].includes(mode))setTimeout(()=>value.textContent='',mode==='rollback'?800:4800);};
   if(month){let year=2026;layer.querySelector('button').onclick=()=>{actions.nav++;setTimeout(()=>layer.querySelector('.phoenix-calendar-month-panel-year-select-content').textContent=(--year)+'年',mode==='month-delayed'?150:0);};layer.querySelector('.phoenix-calendar-month-panel-month').onclick=()=>{actions.select++;setTimeout(commit,mode==='month-delayed'?450:0);};}
   else layer.querySelector('[role="option"]').onclick=e=>{actions.select++;e.currentTarget.setAttribute('aria-selected','true');if(mode!=='confirm')setTimeout(commit,mode==='delayed'?450:0);};
   if(mode==='confirm')layer.querySelector('button').onclick=()=>{actions.confirm++;setTimeout(commit,250);};
   if(mode==='linked-rollback')document.querySelector('#email').onblur=()=>setTimeout(()=>value.textContent='',4800);
   document.querySelector('#save').onclick=()=>actions.save++;
   const store={profile:month?{birthDate:'2019-09'}:{degree:'本科',email:'demo@example.com'},settings:{}};
   window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async m=>{if(m.type==='SAVE_RUN_LOG')logs.push(m.log);return {ok:true};}}};
  },{mode,month});
  for(const file of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,file)});
  const result=await page.evaluate(mode=>new Promise(resolve=>{listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve);if(mode==='stop')setTimeout(()=>listener({type:'STOP_FILL'},null,()=>{}),100);}),mode);
  const state=await page.evaluate(()=>({actions,log:logs.at(-1)})),item=result.selfCheck?.items.find(i=>i.fieldKey===(month?'birthDate':'degree'));
  assert.equal(state.actions.save,0);assert(state.actions.select<=1);
  if(mode==='stop')assert.equal(state.actions.select,0);
  else if(mode.includes('rollback'))assert.notEqual(item?.status,'verified',mode);
  else{
   assert.equal(item?.status,'verified',JSON.stringify(result));assert.equal(await page.locator('#layer').isVisible(),false);
   const start=state.log.events.find(e=>e.stage==='task-start'),end=state.log.events.find(e=>e.stage==='write-result'),elapsed=end.ms-start.ms;
   console.log(mode+' Phoenix task: '+elapsed+' ms');
   if(mode==='ready')assert(elapsed<450,'ready select must not pay fixed 140 + 140 + 350 ms waits');
   if(mode==='month')assert(elapsed<650,'ready calendar should advance on year changes, without fixed waits');
   if(month)assert.equal(state.actions.nav,7,'no duplicate or skipped year navigation');
   if(mode==='closing')assert.equal(state.actions.open,1,'do not toggle during automatic close');
   if(mode==='confirm')assert.equal(state.actions.confirm,1);
   assert(state.log.events.filter(e=>e.stage==='settlement-check').at(-1).ms-end.ms>=4900,'preserve late rollback observation');
  }
  console.log('PASS Phoenix readiness: '+mode);await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
