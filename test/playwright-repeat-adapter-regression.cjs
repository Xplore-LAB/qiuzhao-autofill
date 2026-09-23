const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {PlaywrightTool} = require('../src/playwright-tool.cjs');

(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.AUTOFILL_BROWSER_PATH ? {executablePath:process.env.AUTOFILL_BROWSER_PATH} : {})});
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <section id="projects" role="group" aria-label="项目经历">
        <fieldset role="group" aria-label="项目记录 1"><input aria-label="名称"></fieldset>
        <button type="button">新增项目</button>
      </section>
      <button id="submit" type="submit">提交</button>
      <script>
        let submitted=0;
        document.getElementById('submit').onclick=event=>{event.preventDefault();submitted++;};
        document.querySelector('#projects button').onclick=()=>setTimeout(()=>{
          const row=document.createElement('fieldset');
          row.setAttribute('role','group');
          row.setAttribute('aria-label','项目记录 '+(document.querySelectorAll('#projects fieldset').length+1));
          row.innerHTML='<input aria-label="名称">';
          document.querySelector('#projects button').before(row);
        }, 40);
      </script>`);
    const tool = new PlaywrightTool(page);
    await tool.ensureRepeatedRecords({section:'项目经历', recordName:'项目记录', addButton:'新增项目'}, 3);
    assert.equal(await page.locator('#projects fieldset').count(), 3);
    assert.equal(await page.evaluate(() => submitted), 0);
    await assert.rejects(() => tool.ensureRepeatedRecords({section:'项目经历', recordName:'项目记录', addButton:'新增项目'}, 21), /too-many-records/);
    console.log('playwright repeat adapter passed: generic record labels, confirmed adds, no submit');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
