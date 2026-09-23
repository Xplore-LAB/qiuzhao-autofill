// Fixed synthetic PDF fixtures, exercised in a real MV3 extension under its CSP.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

function demoPdf({ pages = 2, empty = false, long = false, text = '' } = {}) {
  const objects = [];
  const add = text => (objects.push(text), objects.length);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  const latin = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const glyphs=[...new Set(('演示姓名'+text).split(''))];
  const hex=n=>n.toString(16).padStart(4,'0');
  const pairs=glyphs.map((char,index)=>'<'+hex(index+1)+'> <'+hex(char.charCodeAt(0))+'>');
  const maps=[];for(let i=0;i<pairs.length;i+=100){const part=pairs.slice(i,i+100);maps.push(part.length+' beginbfchar '+part.join(' ')+' endbfchar');}
  const mapping = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Demo def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange '+maps.join(' ')+' endcmap CMapName currentdict /CMap defineresource pop end end';
  const unicode = add('<< /Length ' + Buffer.byteLength(mapping) + ' >>\nstream\n' + mapping + '\nendstream');
  const descendant = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Demo /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 1000 >>');
  const chinese = add('<< /Type /Font /Subtype /Type0 /BaseFont /Demo /Encoding /Identity-H /DescendantFonts [' + descendant + ' 0 R] /ToUnicode ' + unicode + ' 0 R >>');
  const kids = [];
  for (let index = 1; index <= pages; index++) {
    const lines = long ? '(' + 'Demo resume '.repeat(30000) + ') Tj' : '(Demo Resume Page ' + index + ') Tj 0 -20 Td (demo@example.com) Tj';
    const sourceLines=text.split('\n'),perPage=Math.ceil(sourceLines.length/pages);
    const textStream=sourceLines.slice((index-1)*perPage,index*perPage).map(line=>'<'+line.split('').map(c=>hex(glyphs.indexOf(c)+1)).join('')+'> Tj 0 -20 Td').join(' ');
    const content = empty ? '0 0 100 100 re f' : text ? 'BT /F2 8 Tf 40 740 Td '+textStream+' ET' : 'BT /F1 12 Tf 40 700 Td ' + lines + ' 0 -20 Td /F2 12 Tf <0001000200030004> Tj ET';
    const stream = add('<< /Length ' + Buffer.byteLength(content) + ' >>\nstream\n' + content + '\nendstream');
    kids.push(add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + (long ? '10000000' : '612') + ' 792] /Resources << /Font << /F1 ' + latin + ' 0 R /F2 ' + chinese + ' 0 R >> >> /Contents ' + stream + ' 0 R >>'));
  }
  objects[1] = '<< /Type /Pages /Count ' + pages + ' /Kids [' + kids.map(id => id + ' 0 R').join(' ') + '] >>';
  let output = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += (index + 1) + ' 0 obj\n' + object + '\nendobj\n'; });
  const xref = Buffer.byteLength(output);
  output += 'xref\n0 ' + offsets.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  output += 'trailer\n<< /Root 1 0 R /Size ' + offsets.length + ' >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(output);
}

(async () => {
  const fixture = require('./extension-fixture.cjs')(root);
  let context;
  try {
  context = await chromium.launchPersistentContext('', {
    headless: true, channel: 'chromium', executablePath: process.env.AUTOFILL_BROWSER_PATH,
    args: ['--disable-extensions-except=' + fixture.directory, '--load-extension=' + fixture.directory],
  });
  const remoteRequests = [], errors = [];
  try {
    await context.route(/^https?:/, route => { remoteRequests.push(route.request().url()); return route.abort(); });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('chrome-extension://' + extensionId + '/popup/popup.html');
    await page.waitForSelector('#sourceFile', { state: 'attached' });
    await page.evaluate(async () => {
      await chrome.storage.local.set({ profile: { name: 'Original demo profile' } });
      document.addEventListener('securitypolicyviolation', event => { (globalThis.cspErrors ||= []).push(event.violatedDirective); });
    });
    await page.locator('#sourceFile').setInputFiles({ name: 'demo-resume.pdf', mimeType: 'application/pdf', buffer: demoPdf() });
    await page.waitForFunction(() => document.querySelector('#sourceStatus').dataset.state === 'success');
    const state = await page.evaluate(() => chrome.storage.local.get(['sourceMaterial', 'profile', 'pendingProfileUpdate']));
    assert.match(state.sourceMaterial.text, /Demo Resume Page 1[\s\S]*Demo Resume Page 2/);
    assert.match(state.sourceMaterial.text, /演示姓名/);
    assert.equal(state.sourceMaterial.type, 'pdf');
    assert.equal(state.profile.name, 'Original demo profile', 'reading a PDF cannot replace structured profile');
    assert.equal(state.pendingProfileUpdate.incoming.email, 'demo@example.com', 'PDF import automatically stages local extraction');
    assert.match(await page.locator('#updateRows').textContent(),/原文依据/);
    // Existing review cannot be silently replaced by another import.
    await page.locator('#sourceFile').setInputFiles({ name: 'replacement.pdf', mimeType: 'application/pdf', buffer: demoPdf() });
    await page.waitForFunction(() => document.querySelector('#sourceStatus').dataset.state === 'error');
    assert.equal(await page.evaluate(async()=>(await chrome.storage.local.get('sourceMaterial')).sourceMaterial.name),'demo-resume.pdf');
    await page.locator('#cancelUpdateBtn').click();

    const extract = async buffer => page.evaluate(async bytes => {
      const { extractPdfText } = await import(chrome.runtime.getURL('shared/pdf-import.js'));
      try { return { result: await extractPdfText(new File([Uint8Array.from(bytes)], 'fixture.pdf')) }; }
      catch (error) { return { error: error.message }; }
    }, Array.from(buffer));
    assert.match((await extract(demoPdf({ empty: true }))).error, /没有可读取的文本.*扫描件/);
    assert.match((await extract(demoPdf({ pages: 51 }))).error, /超过 50 页/);
    assert.match((await extract(demoPdf({ pages: 1, long: true }))).error, /超过 30 万字/);
    assert.match((await extract(Buffer.from('not a PDF'))).error, /格式无效|损坏/);
    assert.match((await extract(Buffer.alloc(0))).error, /文件为空/);
    const oversized = await page.evaluate(async () => {
      const { extractPdfText } = await import(chrome.runtime.getURL('shared/pdf-import.js'));
      try { await extractPdfText({ size: 21 * 1024 * 1024, arrayBuffer() { throw new Error('must not read'); } }); }
      catch (error) { return error.message; }
    });
    assert.match(oversized, /不能超过 20MB/);
    const timeout = await page.evaluate(async bytes => {
      const { extractPdfText, PDF_LIMITS } = await import(chrome.runtime.getURL('shared/pdf-import.js'));
      const original = globalThis.setTimeout;
      globalThis.setTimeout = (fn, ms, ...args) => original(fn, ms === PDF_LIMITS.timeoutMs ? 0 : ms, ...args);
      try { await extractPdfText(new File([Uint8Array.from(bytes)], 'timeout-demo.pdf')); }
      catch (error) { return error.message; }
      finally { globalThis.setTimeout = original; }
    }, Array.from(demoPdf()));
    assert.match(timeout, /超过 30 秒/);
    assert.match((await extract(demoPdf())).result.text, /演示姓名/, 'a timeout must not break later imports');
    // A rejected import must preserve the last successfully read local source.
    await page.locator('#sourceFile').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: demoPdf({ empty: true }) });
    await page.waitForFunction(() => document.querySelector('#sourceStatus').dataset.state === 'error');
    assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('sourceMaterial')).sourceMaterial.name), 'demo-resume.pdf');

    // Full onboarding: actual PDF bytes -> production worker -> draft -> chosen merge -> real content script.
    const resume=require('./resume-parser-regression.cjs').text;
    await page.locator('#sourceFile').setInputFiles({name:'synthetic-resume.pdf',mimeType:'application/pdf',buffer:demoPdf({text:resume})});
    await page.waitForFunction(()=>document.querySelector('#sourceStatus').dataset.state==='success');
    const draft=await page.evaluate(async()=>(await chrome.storage.local.get('pendingProfileUpdate')).pendingProfileUpdate);
    assert.equal(draft.incoming.educationBulk.length,2);assert.equal(draft.incoming.internshipsBulk.length,2);assert.equal(draft.incoming.projectsBulk.length,2);
    assert.equal(draft.incoming.educationBulk[0].educationSchool,'浙江大学');
    assert.equal(draft.incoming.projectsBulk[1].projectDescription,'完成数据校验。');
    assert.equal(await page.locator('[data-update-key="name"]').isChecked(),false,'existing name stays opt-in');
    // Reopening keeps the review and source evidence.
    await page.reload();await page.locator('#updateReview').waitFor({state:'visible'});
    assert.match(await page.locator('#updateRows').textContent(),/原文依据/);
    await page.locator('#applyUpdateBtn').click();
    await page.waitForFunction(()=>document.querySelector('#updateReview').hidden);
    const applied=await page.evaluate(async()=>(await chrome.storage.local.get('profile')).profile);
    assert.equal(applied.name,'Original demo profile');assert.equal(applied.email,'demo@example.com');assert.equal(applied.educationBulk.length,2);
    const form=await context.newPage();
    await form.route('https://resume-fixture.invalid/**',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><form><label>姓名<input name="name"></label><label>邮箱<input name="email"></label><label>手机号<input name="phone"></label><label>毕业院校<input name="school"></label><label>专业<input name="major"></label><label>毕业时间<input name="graduationDate"></label><button type="submit">提交</button></form><script>
      window.submissions=0;const form=document.querySelector('form');form.onsubmit=e=>{e.preventDefault();submissions++};
      for(const [kind,title,fields,initial] of [
        ['education','教育经历',{educationSchool:'学校',educationMajor:'专业',educationStartDate:'开始时间',educationEndDate:'结束时间'},1],
        ['project','项目经历',{projectName:'项目名称',projectStartDate:'开始时间',projectEndDate:'结束时间',projectDescription:'项目描述'},0]
      ]){
        const section=document.createElement('section');section.dataset.kind=kind;section.innerHTML='<h3>'+title+'</h3><button type="button">添加</button>';form.append(section);
        const button=section.querySelector('button');function add(){const row=document.createElement('div');row.className='record';for(const [key,label] of Object.entries(fields)){const item=document.createElement('div');item.className='form-item';item.innerHTML='<label>'+label+'</label><input data-key="'+key+'">';row.append(item);}section.insertBefore(row,button);}
        button.onclick=add;for(let i=0;i<initial;i++)add();
      }
    </script>`}));
    await form.goto('https://resume-fixture.invalid/form');await form.bringToFront();
    const tabId=await worker.evaluate(async()=>(await chrome.tabs.query({active:true,currentWindow:true}))[0].id);
    const quick=await context.newPage();await quick.goto('chrome-extension://'+extensionId+'/popup/quick.html?tabId='+tabId);
    await quick.waitForFunction(()=>!document.querySelector('#start').disabled);
    await quick.locator('#start').click();await quick.locator('#preview').waitFor({state:'visible'});
    assert.equal(await form.locator('[name="email"]').inputValue(),'','preview must not fill');
    await form.bringToFront();
    await quick.locator('#start').click();
    try { await quick.locator('#result-card').waitFor({state:'visible',timeout:30000}); }
    catch(error) { console.error(await quick.locator('body').innerText()); throw error; }
    for(const [key,value] of Object.entries({name:'Original demo profile',email:'demo@example.com',phone:'13800000000',school:'北京大学',major:'软件工程',graduationDate:'2027-06'}))assert.equal(await form.locator('[name="'+key+'"]').inputValue(),value,key);
    for (const [kind,bulk] of [['education','educationBulk'],['project','projectsBulk']]) {
      const rows=form.locator('[data-kind="'+kind+'"] .record');assert.equal(await rows.count(),2,kind+' records added');
      for(let i=0;i<2;i++)for(const input of await rows.nth(i).locator('input').all()) {
        const key=await input.getAttribute('data-key');assert.equal(await input.inputValue(),applied[bulk][i][key],kind+' '+i+' '+key);
      }
    }
    assert.equal(await form.evaluate(()=>submissions),0);
    await page.setViewportSize({width:1000,height:850});await page.screenshot({path:require('node:path').join(root,'artifacts/pdf-onboarding.png'),fullPage:true});
    assert.deepEqual(await page.evaluate(() => globalThis.cspErrors || []), []);
    assert.deepEqual(remoteRequests, [], 'reading PDF must not upload data or load external resources');
    assert.deepEqual(errors, []);
    console.log('PASS PDF onboarding: actual MV3 PDF worker, local multi-record draft, persistent evidence, chosen merge, actual autofill, zero remote requests/submissions, malformed/scan/size/page/text/timeout recovery');
  } finally { await context.close(); }
  } finally { fixture.remove(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
