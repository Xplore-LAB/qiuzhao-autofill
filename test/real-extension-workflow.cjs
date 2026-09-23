// Load the actual MV3 extension, real service worker/storage/messaging and two frames.
// All content is served by this local fixture. No recruitment site or AI calls.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const form=`<!doctype html><meta charset="utf-8"><form><div class="form-item"><label for="name">姓名</label><input id="name"></div><div class="form-item"><label for="email">邮箱</label><input id="email"></div><div class="form-item"><label for="phone">手机号</label><input id="phone" value="13900000000"></div><div class="form-item"><label for="contact">紧急联系人 *</label><input id="contact" placeholder="请输入紧急联系人"></div><div class="form-item"><label for="contact-phone">紧急联系人电话 *</label><input id="contact-phone" placeholder="请输入紧急联系人电话"></div><button type="submit">提交</button></form><script>window.submitted=0;document.querySelector('form').onsubmit=e=>{e.preventDefault();submitted++};</script>`;
const job={ '@context':'https://schema.org','@type':'JobPosting',title:'演示研发工程师',hiringOrganization:{name:'演示公司'},jobLocation:{address:{addressRegion:'浙江',addressLocality:'杭州'}},description:'<p>固定演示岗位描述</p>',validThrough:'2026-12-01'};
const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(req.url==='/form-a'||req.url==='/form-b'?form:`<!doctype html><meta charset="utf-8"><h1>演示研发工程师</h1><script type="application/ld+json">${JSON.stringify(job)}</script><iframe title="申请表一" src="/form-a" style="width:600px;height:240px"></iframe><iframe title="申请表二" src="/form-b" style="width:600px;height:240px"></iframe>`);
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'qiuzhao-extension-'));
  const fixture=require('./extension-fixture.cjs')(root);
  let context;
  try{
    context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,executablePath:process.env.AUTOFILL_EXTENSION_BROWSER_PATH,args:['--disable-extensions-except='+fixture.directory,'--load-extension='+fixture.directory]});
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const extensionId=new URL(worker.url()).host;
    const errors=[];context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
    const page=await context.newPage();await page.goto(base+'/job');
    await page.bringToFront();
    const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({active:true,currentWindow:true}))[0].id);
    const panel=await context.newPage();await panel.goto(`chrome-extension://${extensionId}/popup/quick.html?tabId=${tabId}`);
    await panel.waitForFunction(()=>document.querySelectorAll('#frame-select option').length===3);
    assert.equal(await panel.locator('#start').isDisabled(),true,'multiple frames require a deliberate selection');
    assert.match(await panel.locator('#profile').textContent(),/尚未建立资料/,'fresh installation works without a private default file');
    await worker.evaluate(()=>chrome.storage.local.set({profile:{name:'演示姓名',email:'demo@example.com',phone:'13800000000',customs:[{label:'紧急联系人',value:'演示联系人'},{label:'紧急联系人电话',value:'13900000001'}]},settings:{aiEnabled:false}}));
    const target=await panel.locator('#frame-select option').nth(1).getAttribute('value');
    await panel.locator('#frame-select').selectOption(target);
    await panel.waitForFunction(()=>!document.getElementById('start').disabled);
    await page.bringToFront();
    await panel.locator('#start').click();
    await panel.locator('#preview').waitFor({state:'visible'});
    const a=page.frames().find(frame=>frame.url()===base+'/form-a'),b=page.frames().find(frame=>frame.url()===base+'/form-b');
    assert.equal(await a.locator('#name').inputValue(),'');assert.equal(await b.locator('#name').inputValue(),'','preview performs no form writes');
    // Stale previews must fail in the production message listener as well as the UI.
    const stale=await panel.evaluate(id=>chrome.tabs.sendMessage(id,{type:'PREVIEW_FORM'},{frameId:Number(document.querySelector('#frame-select').value)}),tabId);
    await a.locator('#name').fill('手动输入');
    const rejected=await panel.evaluate(({id,token})=>chrome.tabs.sendMessage(id,{type:'FILL_FORM',previewToken:token,selfCheck:true},{frameId:Number(document.querySelector('#frame-select').value)}),{id:tabId,token:stale.previewToken});
    assert.equal(rejected.note,'preview-expired');assert.equal(await a.locator('#email').inputValue(),'');
    // The fixture's manual value is intentionally retained, then the UI rescans.
    await panel.locator('#refresh-page').click();await panel.waitForFunction(()=>!document.getElementById('start').disabled);
    await page.bringToFront();await panel.locator('#start').click();await panel.locator('#preview').waitFor({state:'visible'});
    await panel.locator('#start').click();await panel.waitForFunction(()=>document.getElementById('result-card').hidden===false,{},{timeout:30000});
    assert.equal(await a.locator('#name').inputValue(),'手动输入');assert.equal(await a.locator('#email').inputValue(),'demo@example.com');
    assert.equal(await a.locator('#phone').inputValue(),'13900000000');
    assert.equal(await b.locator('#email').inputValue(),'','unselected frame remains untouched');
    assert.equal(await a.locator('#contact').inputValue(),'演示联系人');
    assert.equal(await a.locator('#contact-phone').inputValue(),'13900000001','contact telephone must not receive the contact name');
    assert.equal(await b.locator('#contact').inputValue(),'','custom fields must also respect the selected frame');
    assert.equal(await a.evaluate(()=>submitted),0);assert.equal(await b.evaluate(()=>submitted),0);
    await panel.locator('#job-card summary').click();await panel.locator('#capture-job').click();await panel.locator('#job-form').waitFor({state:'visible'});
    assert.equal(await panel.locator('#job-title').inputValue(),'演示研发工程师');assert.equal(await panel.locator('#job-company').inputValue(),'演示公司');
    await panel.locator('#save-job').click();await panel.waitForFunction(()=>document.getElementById('job-message').textContent.includes('已保存'));
    const records=await panel.evaluate(()=>chrome.runtime.sendMessage({type:'APPLICATION_LIST'}));
    assert.equal(records.applications.length,1);assert.equal(records.applications[0].status,'saved');
    assert.equal(records.applications[0].description,'固定演示岗位描述');
    assert(!JSON.stringify(records).includes('demo@example.com'),'application metadata excludes resume fields');
    const manager=await context.newPage();await manager.goto(`chrome-extension://${extensionId}/popup/applications.html`);
    await manager.getByText('演示研发工程师',{exact:true}).waitFor();
    fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
    await panel.setViewportSize({width:360,height:900});await panel.screenshot({path:path.join(root,'artifacts/extension-workflow.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS real MV3 extension: first install, service worker, frame selection, read-only preview, stale-plan rejection, protected fill, no submission, job capture and persistent tracker');
  }finally{
    if(context)await context.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(profile,{recursive:true,force:true});fixture.remove();
  }
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
