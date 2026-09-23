const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 assert(manifest.permissions.includes('sidePanel'));assert(!manifest.action.default_popup);
 const worker=fs.readFileSync(path.join(root,'background/service-worker.js'),'utf8');
 const snippet=worker.slice(worker.indexOf('// Each tab has'),worker.indexOf('chrome.runtime.onInstalled'));
 const calls=[];let clicked;
 vm.runInNewContext(snippet,{console,chrome:{sidePanel:{setOptions:async o=>calls.push(['options',o]),open:async o=>calls.push(['open',o])},action:{onClicked:{addListener:f=>clicked=f}}}});
 const pending=clicked({id:7});
 assert.equal(calls[2]?.[0],'open','open must run synchronously in the user gesture');
 await pending;assert.equal(calls[0][1].enabled,false);
 assert.equal(calls[1][1].path,'popup/quick.html?tabId=7');assert.equal(calls[2][1].tabId,7);
 const count=calls.length;await clicked({});assert.equal(calls.length,count);
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{
  const page=await browser.newPage({viewport:{width:300,height:750}});
  await page.addInitScript({content:`window.active=7;window.sent=[];window.chrome={storage:{local:{get:async()=>({profile:{name:'演示姓名'},settings:{}})}},runtime:{getManifest:()=>({version:'1.16.3'}),sendMessage:async()=>({ok:true,frames:[{frameId:0,host:'fixture.invalid',totalControls:3}]})},tabs:{query:async()=>[{id:active}],sendMessage:async(id,m)=>{sent.push({id,type:m.type});if(m.type==='PREVIEW_FORM')return {previewToken:'demo-preview',totalControls:3,filledControls:0,ruleCandidates:2,aiCandidates:1};return m.type==='PING'?{host:'fixture.invalid',contentBuild:'1.16.3-dev'}:{running:false};}}};`});
  await page.goto(pathToFileURL(path.join(root,'popup/quick.html')).href+'?tabId=7');
  await page.waitForFunction(()=>!document.getElementById('start').disabled);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow in narrow sidebar');
  await page.locator('#start').click();await page.locator('#preview').waitFor({state:'visible'});
  await page.evaluate(()=>active=8);await page.locator('#start').click();
  await page.waitForFunction(()=>document.getElementById('message').textContent.includes('请回到此侧栏'));
  assert.equal(await page.evaluate(()=>sent.filter(m=>m.type==='FILL_FORM').length),0,'inactive tab must not receive fill');
  assert(await page.evaluate(()=>sent.every(m=>m.id===7)),'polling stays bound to original tab');
  await page.screenshot({path:path.join(root,'test/sidepanel-preview.png')});
  console.log('PASS sidebar: manifest, action opens tab-specific panel, narrow layout, no cross-tab fill');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
