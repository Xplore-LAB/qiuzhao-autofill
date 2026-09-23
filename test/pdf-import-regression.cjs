// Fixed synthetic PDF fixtures, exercised in a real MV3 extension under its CSP.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

function demoPdf({ pages = 2, empty = false, long = false } = {}) {
  const objects = [];
  const add = text => (objects.push(text), objects.length);
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  const latin = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const mapping = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Demo def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange 4 beginbfchar <0001> <6F14> <0002> <793A> <0003> <59D3> <0004> <540D> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end';
  const unicode = add('<< /Length ' + Buffer.byteLength(mapping) + ' >>\nstream\n' + mapping + '\nendstream');
  const descendant = add('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Demo /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 1000 >>');
  const chinese = add('<< /Type /Font /Subtype /Type0 /BaseFont /Demo /Encoding /Identity-H /DescendantFonts [' + descendant + ' 0 R] /ToUnicode ' + unicode + ' 0 R >>');
  const kids = [];
  for (let index = 1; index <= pages; index++) {
    const lines = long ? '(' + 'Demo resume '.repeat(30000) + ') Tj' : '(Demo Resume Page ' + index + ') Tj 0 -20 Td (demo@example.com) Tj';
    const content = empty ? '0 0 100 100 re f' : 'BT /F1 12 Tf 40 700 Td ' + lines + ' 0 -20 Td /F2 12 Tf <0001000200030004> Tj ET';
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
    const state = await page.evaluate(() => chrome.storage.local.get(['sourceMaterial', 'profile', 'pendingUpdate']));
    assert.match(state.sourceMaterial.text, /Demo Resume Page 1[\s\S]*Demo Resume Page 2/);
    assert.match(state.sourceMaterial.text, /演示姓名/);
    assert.equal(state.sourceMaterial.type, 'pdf');
    assert.equal(state.profile.name, 'Original demo profile', 'reading a PDF cannot replace structured profile');
    assert.equal(state.pendingUpdate, undefined, 'AI extraction must wait for an explicit click');

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
    assert.deepEqual(await page.evaluate(() => globalThis.cspErrors || []), []);
    assert.deepEqual(remoteRequests, [], 'reading PDF must not upload data or load external resources');
    assert.deepEqual(errors, []);
    console.log('PASS PDF import: MV3 CSP, local worker, Chinese/English multipage, manual AI boundary, scan/invalid/empty/size/page/text/timeout limits, preserve prior source');
  } finally { await context.close(); }
  } finally { fixture.remove(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
