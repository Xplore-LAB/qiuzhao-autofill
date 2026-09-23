const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const timing=fs.readFileSync(path.join(root,'shared/run-timing.js'),'utf8');
const mock=`
window.__fixture={state:null,requests:[]};
chrome={storage:{local:{get:async()=>({profile:{name:'演示姓名',educationBulk:[{},{}]},settings:{aiEnabled:true}})}},runtime:{getURL:p=>'https://fixture.invalid/'+p,sendMessage:async()=>({ok:true,changed:false,frames:[{frameId:0,host:'fixture.invalid',totalControls:3}]})},tabs:{query:async()=>[{id:7}],create:async({url})=>{window.__fixture.opened=url;},sendMessage:async(id,m)=>{
 const f=window.__fixture;f.requests.push(m);
 if(m.type==='PREVIEW_FORM')return {previewToken:'demo-preview',totalControls:3,filledControls:0,ruleCandidates:2,aiCandidates:1,ruleLabels:['姓名'],repeatSections:[]};
 if(m.type==='PING')return {host:'fixture.invalid',contentBuild:'1.16.4-dev'};
 if(m.type==='GET_FILL_STATUS')return f.state?{...f.state,timing:f.clock.snapshot()}:{running:false};
 if(m.type==='FILL_FORM'){f.run={phase:'planning',startedAt:Date.now()};f.clock=QIUZHAO_RUN_TIMING.attach(f.run);f.state={running:true,total:0,completed:0};return new Promise(resolve=>f.finish=()=>{f.clock.finish();f.state={running:false,outcome:'finished',summary:{verified:2,pending:1}};resolve({filled:['演示字段']});});}
 if(m.type==='STOP_FILL'){f.stopped=true;return {ok:true};}
}}};`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{
  const context=await browser.newContext({viewport:{width:390,height:650}});
  await context.addInitScript({content:timing+mock});
  const page=await context.newPage();await page.goto(pathToFileURL(path.join(root,'popup/quick.html')).href);
  await page.waitForFunction(()=>!document.getElementById('start').disabled);
  assert.equal(await page.locator('#profile').textContent(),'资料已就绪 · 教育 2 条');
  assert.equal(await page.locator('#progress').isVisible(),false);
  await page.locator('#start').click();await page.locator('#preview').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>__fixture.requests.some(r=>r.type==='FILL_FORM')),false);
  await page.locator('#start').click();await page.waitForFunction(()=>!document.getElementById('progress').hidden);
  assert.equal(await page.locator('#bar').getAttribute('value'),null);
  const first=await page.locator('#elapsed').textContent();
  await page.waitForFunction(first=>document.getElementById('elapsed').textContent!==first,first);
  await page.evaluate(()=>{__fixture.run.phase='filling';__fixture.state.total=2;__fixture.state.completed=1;__fixture.state.field='奖励名称';});
  await page.waitForFunction(()=>document.getElementById('bar').value===1 && document.getElementById('bar').max===2);
  assert((await page.locator('#field').textContent()).includes('奖励名称'));
  await page.evaluate(()=>{__fixture.run.phase='self-check';});
  await page.waitForFunction(()=>document.getElementById('phase').textContent==='核验');
  await page.locator('body').screenshot({path:path.join(__dirname,'quick-progress-preview.png')});
  await page.evaluate(()=>__fixture.finish());
  await page.waitForFunction(()=>document.getElementById('phase').textContent==='部分完成，仍需核对');
  assert.equal(await page.locator('#result-card').isVisible(),true);
  assert.equal(await page.locator('#result-title').textContent(),'1 项待核对');
  assert.equal(await page.locator('#verified-count').textContent(),'2');
  assert.equal(await page.locator('#pending-count').textContent(),'1');
  await page.evaluate(()=>{__fixture.state.pendingItems=[{id:'field-3',label:'演示学校',reason:'existing-unverified'}];const send=chrome.tabs.sendMessage;chrome.tabs.sendMessage=async(id,m)=>{if(m.type==='LOCATE_SELF_CHECK'){__fixture.located=m.id;return {ok:true};}return send(id,m);};});
  await page.locator('#pending-list button').waitFor();
  assert((await page.locator('#pending-list').textContent()).includes('保留已有内容，请确认'));
  await page.locator('#pending-list button').click();assert.equal(await page.evaluate(()=>__fixture.located),'field-3');
  assert((await page.locator('#version').textContent()).includes('1.16.4'));
  const end=await page.locator('#elapsed').textContent();await page.waitForTimeout(350);assert.equal(await page.locator('#elapsed').textContent(),end);
  const fill=await page.evaluate(()=>__fixture.requests.find(r=>r.type==='FILL_FORM'));
  assert.deepEqual(fill,{type:'FILL_FORM',overwrite:false,useAI:true,selfCheck:true,previewToken:'demo-preview'});
  await page.locator('body').screenshot({path:path.join(__dirname,'quick-complete-preview.png')});
  // A newly created popup reads the page-owned running clock instead of restarting it.
  const reopen=await context.newPage();await reopen.addInitScript({content:`
    const real=chrome.tabs.sendMessage;
    chrome.tabs.sendMessage=async(id,m)=>m.type==='GET_FILL_STATUS'?{running:true,total:4,completed:2,field:'演示字段',timing:{elapsedMs:12500,stage:'filling',stageTimes:{planning:3000,filling:9500,verification:0}}}:real(id,m);
  `});
  await reopen.goto(pathToFileURL(path.join(root,'popup/quick.html')).href);
  await reopen.waitForFunction(()=>!document.getElementById('progress').hidden);
  assert.equal(await reopen.locator('#start').isDisabled(),true);
  assert((await reopen.locator('#elapsed').textContent()).startsWith('12.'));
  await reopen.locator('#stop').click();assert.equal(await reopen.evaluate(()=>__fixture.stopped),true);
  const managerContext=await browser.newContext({viewport:{width:1100,height:780}});
  const managerMock=fs.readFileSync(path.join(root,'test/popup-mock-chrome.js'),'utf8');
  await managerContext.addInitScript({content:`document.addEventListener('DOMContentLoaded',()=>{${managerMock}\n__popupHarness.store.profile={name:'演示姓名'};__popupHarness.store.siteObservations={'zhuanzhuan.example':{scans:2,runs:1,lastSeenAt:1,lastRun:{verified:3}}};},{once:true});`});
  const manager=await managerContext.newPage(),errors=[];manager.on('pageerror',error=>errors.push(error.message));
  await manager.goto(pathToFileURL(path.join(root,'popup/popup.html')).href+'?manage=1&view=logs');
  await manager.waitForFunction(()=>document.body.classList.contains('manager'));
  assert.equal(await manager.locator('.actions').isVisible(),false);
  assert.equal(await manager.locator('#runLogsResult').isVisible(),true);
  await manager.locator('[data-tab="basic"]').click();
  assert.equal(await manager.locator('#tab-basic [data-key="name"]').inputValue(),'演示姓名');
  await manager.locator('[data-tab="custom"]').click();
  assert((await manager.locator('#siteObservationList').textContent()).includes('zhuanzhuan.example'));
  await manager.locator('header').screenshot({path:path.join(__dirname,'manager-header-preview.png')});
  assert.deepEqual(errors,[]);
  await managerContext.close();
  console.log('PASS quick UI: minimal ready state, indeterminate planning, live time, operation progress, verification, frozen finish, protected fill, reconnect, stop');
  console.log('PASS manager UI: standalone mode, detail log entry, profile tabs retained, no page errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
