const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.AUTOFILL_BROWSER_PATH });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 750 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.fixture = { store: { profile: {}, settings: {} }, listeners: [], fills: [] };
      window.updateStore = (key, value) => {
        fixture.store[key] = value;
        for (const listener of fixture.listeners) listener({ [key]: { newValue: value } }, 'local');
      };
      window.chrome = {
        storage: {
          local: { get: async () => structuredClone(fixture.store) },
          onChanged: {
            addListener: listener => fixture.listeners.push(listener),
            removeListener: listener => { fixture.listeners = fixture.listeners.filter(item => item !== listener); },
          },
        },
        runtime: { sendMessage: async () => ({ ok: true, source: 'storage', changed: false, frames: [{frameId: 0, host: 'fixture.invalid', totalControls: 3}] }) },
        tabs: {
          query: async () => [{ id: 7 }],
          sendMessage: async (id, message) => {
            if (message.type === 'PREVIEW_FORM') return {previewToken: 'demo-preview', totalControls: 3, filledControls: 0, ruleCandidates: 2, aiCandidates: 1};
            if (message.type === 'PING') return { host: 'fixture.invalid', contentBuild: '1.16.1-dev' };
            if (message.type === 'FILL_FORM') fixture.fills.push(message);
            return { running: false };
          },
        },
      };
    });
    await page.goto(pathToFileURL(path.join(root, 'popup/quick.html')).href + '?tabId=7');
    await page.waitForFunction(() => document.getElementById('site').textContent === 'fixture.invalid');
    assert.equal(await page.locator('#start').isDisabled(), true);
    assert.match(await page.locator('#profile').textContent(), /尚未建立资料/);
    await page.evaluate(() => updateStore('profile', { name: '演示姓名', educationBulk: [{ school: '演示大学' }] }));
    await page.waitForFunction(() => !document.getElementById('start').disabled);
    assert.match(await page.locator('#profile').textContent(), /教育 1 条/);
    await page.evaluate(() => updateStore('settings', { aiEnabled: true }));
    await page.waitForFunction(() => document.getElementById('mode').textContent === 'AI 规划已启用');
    // Also re-read at click time, even if delivery of the storage event is delayed.
    await page.evaluate(() => { fixture.store.settings.aiEnabled = false; });
    await page.locator('#start').click();
    await page.locator('#preview').waitFor({state: 'visible'});
    assert.equal(await page.evaluate(() => fixture.fills.length), 0);
    await page.locator('#start').click();
    await page.waitForFunction(() => fixture.fills.length === 1);
    assert.deepEqual(await page.evaluate(() => fixture.fills[0]), { type: 'FILL_FORM', overwrite: false, useAI: false, selfCheck: true, previewToken: 'demo-preview' });
    assert.match(await page.locator('#mode').textContent(), /本地规则模式/);
    await page.evaluate(() => updateStore('profile', {}));
    await page.waitForFunction(() => document.getElementById('profile').textContent.includes('尚未建立资料'));
    assert.equal(await page.locator('#start').isDisabled(), true);
    await page.evaluate(() => updateStore('profile', { name: '   ' }));
    assert.equal(await page.locator('#start').isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log('PASS profile readiness: first run, live profile/settings updates, latest AI consent, cleared/blank profile');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
