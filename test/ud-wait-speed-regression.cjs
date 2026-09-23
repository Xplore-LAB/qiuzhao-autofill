// Observed Feishu UD structures, synthetic behavior. No live site or private profile.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{for(const mode of ['ready','multi','delayed','rollback','late-rollback','linked-rollback','replaced','stop']){
  const page=await browser.newPage(),multi=mode==='multi',value=multi?'青岛':'本科';
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<style>[hidden]{display:none!important}.ud__select{width:240px;padding:10px}</style><div class="ud-formily-item"><div class="ud-formily-item-label">${multi?'期望工作地点':'最高学历'}</div><div class="ud__select"><div class="ud__select__selector"><div class="ud__select__selector__content"><input role="combobox" type="search"></div></div></div></div><div class="ud__select__dropdown" hidden><div class="ud__select__list__item">${value}</div></div>${mode==='linked-rollback'?'<div class="form-item"><label>邮箱</label><input id="email"></div>':''}<button id="save">保存</button>`}));
  await page.goto('https://fixture.invalid/ud-speed');
  await page.evaluate(({mode,multi,value})=>{
   const anchor=document.querySelector('.ud__select'),layer=document.querySelector('.ud__select__dropdown'),content=anchor.querySelector('.ud__select__selector__content');
   window.logs=[];window.actions={select:0,save:0};document.querySelector('#save').onclick=()=>actions.save++;
   anchor.querySelector('.ud__select__selector').onclick=()=>setTimeout(()=>layer.hidden=false,mode==='delayed'||mode==='stop'?650:0);
   anchor.onkeydown=e=>{if(e.key==='Escape')layer.hidden=true;};
   const clear=()=>content.querySelector('.ud__select__selector__tag,.ud__select__selector__selectItem')?.remove();
   layer.firstElementChild.onclick=()=>{actions.select++;setTimeout(()=>{
    content.insertAdjacentHTML('afterbegin',multi?'<span class="ud__select__selector__tag"><span class="ud__tag__content">'+value+'</span></span>':'<span class="ud__select__selector__selectItem">'+value+'</span>');
    if(!multi)layer.hidden=true;
    if(mode==='rollback'||mode==='late-rollback')setTimeout(clear,mode==='rollback'?800:4800);
    if(mode==='replaced')anchor.replaceWith(anchor.cloneNode(true));
   },mode==='delayed'?450:0);};
   if(mode==='linked-rollback')document.querySelector('#email').onblur=()=>setTimeout(clear,4800);
   const store={profile:{degree:'本科',expectedCity:'青岛',email:'demo@example.com'},settings:{}};
   window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async m=>{if(m.type==='SAVE_RUN_LOG')logs.push(m.log);return {ok:true};}}};
  },{mode,multi,value});
  for(const file of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,file)});
  const result=await page.evaluate(mode=>new Promise(resolve=>{listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve);if(mode==='stop')setTimeout(()=>listener({type:'STOP_FILL'},null,()=>{}),100);}),mode);
  const state=await page.evaluate(()=>({actions,log:logs.at(-1)})),key=multi?'expectedCity':'degree';
  assert.equal(state.actions.save,0);assert(state.actions.select<=1,'never re-click a selected multiselect value');
  const item=result.selfCheck?.items.find(i=>i.fieldKey===key);
  if(['ready','multi','delayed'].includes(mode)){
   assert.equal(item?.status,'verified',JSON.stringify(result));
   assert.equal(await page.locator('.ud__select__dropdown:visible').count(),0);
   const start=state.log.events.find(e=>e.stage==='task-start'),end=state.log.events.find(e=>e.stage==='write-result');
   console.log(mode+' UD control: '+(end.ms-start.ms)+' ms');
   if(mode!=='delayed')assert(end.ms-start.ms<450,'ready selection must not pay fixed waits or exhaust search after commitment');
   assert(state.log.events.filter(e=>e.stage==='settlement-check').at(-1).ms-end.ms>=4900,'retain delayed rollback observation');
  } else if(mode==='stop')assert.equal(state.actions.select,0);
  else assert.notEqual(item?.status,'verified',mode+' must remain a failure');
  console.log('PASS UD readiness: '+mode);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
