import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const content = fs.readFileSync(path.join(root, 'content/content.js'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
const popupHtml = fs.readFileSync(path.join(root, 'popup/popup.html'), 'utf8');
const background = fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8');
const providers = fs.readFileSync(path.join(root, 'shared/providers.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const popupHarness = fs.readFileSync(path.join(root, 'test/popup-ui-harness.html'), 'utf8');
const popupMock = fs.readFileSync(path.join(root, 'test/popup-mock-chrome.js'), 'utf8');

assert.equal(manifest.version, '1.16.4');
assert.ok(manifest.content_scripts[0].js.includes('shared/site-observations.js'), 'site observation module must load before content logic');
assert.ok(popupHtml.includes('v'+manifest.version+'-dev'),'popup version mismatch');
assert.ok(popupHtml.includes('id="siteObservationList"'), 'site observation manager view missing');
assert.ok(content.includes('customSearchInput(anchor, layer)'), 'searchable custom select support missing');
assert.ok(content.includes('customControlMatchesValue(anchor, field, value)'), 'custom control verification missing');
assert.ok(content.includes('dismissVisibleChoiceLayers()'), 'stale choice layer cleanup missing');
assert.ok(content.includes("new InputEvent('input'"), 'framework-compatible input event missing');
assert.ok(content.includes('const REPEAT_GROUPS = ['), 'repeatable section support missing');
assert.ok(content.includes('parseBulkRecords(profile[group.bulkKey], group)'), 'bulk record parser missing');
assert.ok(content.includes('ensureRepeatedRows(item.group, item.records.length, item.records)'), 'repeat row creation missing');
assert.ok(content.includes("msg.type === 'SCAN_FORM'"), 'page overview message missing');
assert.ok(content.includes('buildPageOverview(profile, controls)'), 'page overview planning missing');
assert.ok(content.includes('repeatSectionRoot(group)'), 'repeat section scoping missing');
assert.ok(popup.includes("type: 'SCAN_FORM'"), 'popup overview step missing');
assert.ok(content.includes('optionClickTarget(best.el)'), 'tree choice click target missing');
assert.ok(content.includes("'datetime-local'"), 'native datetime support missing');
assert.ok(content.includes('ownedChoiceLayer(anchor, visibleChoiceLayers())'), 'owned delayed calendar support missing');
assert.ok(content.includes('fillPhoenixMonthPicker(anchor, layer, m)'), 'Phoenix month picker support missing');
assert.ok(content.includes("'projectDescription'"), 'project fields missing');
assert.ok(content.includes("'internshipContent'"), 'internship fields missing');
assert.ok(content.includes('filter(isUsableCustom)'), 'generic custom field filtering missing');
assert.ok(popupHtml.includes('data-tab="experience"'), 'experience profile tab missing');
assert.ok(popupHtml.includes('data-tab="achievement"'), 'achievement profile tab missing');
assert.ok(popupHtml.includes('id="demoBtn"'), 'demo profile button missing');
assert.ok(popup.includes('const DEMO_PROFILE = {'), 'demo profile data missing');
assert.ok(popup.includes("email: 'demo@example.com'"), 'demo profile must use a reserved example email');
assert.ok(popup.includes("$('#demoBtn').addEventListener('click', loadDemoProfile)"), 'demo profile action missing');
assert.ok(popup.includes("stageProfileUpdate(DEMO_PROFILE"), 'demo must go through review');
for (const bulkKey of ['educationBulk', 'projectsBulk', 'internshipsBulk', 'languagesBulk', 'awardsBulk', 'researchBulk']) {
  assert.ok(popup.includes(`key: '${bulkKey}'`), `missing bulk input ${bulkKey}`);
}
assert.ok(background.includes('extractMappingJson(clean)'), 'mixed AI response parser missing');
assert.ok(background.includes("message.type === 'AI_EXTRACT_PROFILE'"), 'AI source extraction message missing');
assert.ok(background.includes("message.type === 'AI_ANALYZE_PAGE'"), 'AI page overview message missing');
assert.ok(background.includes('AI_PAGE_OVERVIEW_PROMPT'), 'AI page overview prompt missing');
assert.ok(background.includes('sanitizeExtractedProfile(parsed)'), 'AI extracted profile sanitizer missing');
assert.ok(background.includes('value, confidence'), 'AI mapping values missing');
assert.ok(popupHtml.includes('id="sourceFile"'), 'source document chooser missing');
assert.ok(popupHtml.includes('../vendor/xlsx.full.min.js'), 'Excel parser missing');
assert.ok(popupHtml.includes('../vendor/mammoth.browser.min.js'), 'Word parser missing');
assert.ok(popup.includes("type: 'AI_EXTRACT_PROFILE'"), 'AI source extraction action missing');
assert.ok(popup.includes('await stageProfileUpdate(response.profile'), 'AI extraction must enter review before changing profile');
assert.ok(popup.includes('mammoth.extractRawText'), 'Word extraction implementation missing');
assert.ok(popup.includes('XLSX.read'), 'Excel extraction implementation missing');
for (const vendorFile of ['xlsx.full.min.js', 'mammoth.browser.min.js', 'LICENSE-xlsx.txt', 'LICENSE-mammoth.txt']) {
  assert.ok(fs.statSync(path.join(root, 'vendor', vendorFile)).size > 1000, `missing vendor asset ${vendorFile}`);
}
assert.deepEqual(manifest.permissions.sort(), ['contextMenus', 'sidePanel', 'storage']);
assert.deepEqual(manifest.optional_host_permissions.sort(), ['http://127.0.0.1/*', 'http://localhost/*', 'https://*/*']);
assert.deepEqual(manifest.host_permissions.sort(), [
  'https://api.anthropic.com/*',
  'https://api.deepseek.com/*',
  'https://api.minimax.io/*',
  'https://api.minimaxi.com/*',
  'https://api.moonshot.cn/*',
  'https://api.openai.com/*',
  'https://api.siliconflow.cn/*',
  'https://dashscope.aliyuncs.com/*',
  'https://generativelanguage.googleapis.com/*',
]);

const fieldBlock = content.match(/const FIELDS = \[([\s\S]*?)\n  \];/);
const ruleBlock = popup.match(/const RULE_FIELDS = \[([\s\S]*?)\n\];/);
assert.ok(fieldBlock && ruleBlock);

const fieldKeys = [...fieldBlock[1].matchAll(/\{ key: '([^']+)'/g)].map(match => match[1]);
const ruleKeys = [...ruleBlock[1].matchAll(/\['([^']+)'/g)].map(match => match[1]);
assert.equal(fieldKeys.length, 98);
assert.deepEqual(fieldKeys.filter(key => !ruleKeys.includes(key)), []);
assert.deepEqual(ruleKeys.filter(key => !fieldKeys.includes(key)), []);

for (const key of ['educationSchool', 'educationMajor', 'educationStartDate', 'educationEndDate', 'academicDegree', 'trainingMethod', 'interviewSite', 'recruitmentSource', 'projectName', 'projectDescription', 'internshipCompany', 'internshipContent', 'languageType', 'awardName', 'researchName', 'willingAllocation']) {
  assert.ok(fieldKeys.includes(key), `missing field ${key}`);
}

for (const sensitive of ['creditcard', 'securitycode', 'verificationcode', 'captcha', 'password']) {
  assert.ok(content.includes(sensitive), `missing sensitive guard ${sensitive}`);
}

for (const source of [content, popup]) {
  assert.equal(/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket/.test(source), false, 'network call introduced');
}
assert.ok(/\bfetch\s*\(/.test(background), 'AI request must stay in the service worker');
assert.ok(background.includes("chrome.storage.local.get(['settings', 'aiSecrets'])"), 'AI credentials must be isolated');
assert.ok(!background.includes("chrome.storage.local.get(['profile'"), 'service worker must not read profile values');
assert.ok(popup.includes("stageProfileUpdate(data.profile"), 'backup restore must go through review without restoring AI settings');
assert.ok(content.includes("type: 'AI_MATCH_FIELDS'"), 'AI mapping message missing');
assert.ok(content.includes('confidence < 0.65'), 'AI confidence guard missing');
for (const provider of ['openai', 'anthropic', 'gemini', 'deepseek', 'qwen', 'kimi', 'siliconflow', 'minimax', 'minimax_global', 'custom']) {
  assert.ok(providers.includes(`id: '${provider}'`), `missing AI provider ${provider}`);
}
assert.ok(background.includes("message.type === 'AI_LIST_MODELS'"), 'model list message missing');
assert.ok(popup.includes('preferredProviderModel'), 'preferred model selection missing');
assert.ok(popup.includes("if (providerId !== 'custom') return;"), 'built-in providers must not open a transient permission prompt');
assert.ok(providers.includes("modelsEndpoint: 'https://api.minimaxi.com/v1/models'"), 'MiniMax model list endpoint missing');
assert.ok(providers.includes("chatEndpoint: 'https://api.minimaxi.com/v1/chat/completions'"), 'MiniMax chat endpoint missing');
assert.ok(providers.includes("modelsEndpoint: 'https://api.minimax.io/v1/models'"), 'MiniMax global model list endpoint missing');
assert.ok(popup.includes("setAiStatus('正在验证密钥并读取模型列表，请稍候…', 'loading')"), 'visible loading feedback missing');
assert.ok(background.includes('normalizeApiKey(raw)'), 'background API key normalization missing');
assert.ok(popup.includes('normalizeApiKeyInput(raw)'), 'popup API key normalization missing');
assert.ok(!/sk-[A-Za-z0-9]{12,}/.test(providers + background + popup), 'hardcoded API key found');
assert.ok(popupHarness.includes('../popup/popup.html'), 'popup UI harness must load the real popup markup');
assert.ok(popupMock.includes("message.type === 'AI_LIST_MODELS'"), 'popup UI model-list mock missing');

assert.equal(/\.submit\s*\(|requestSubmit\s*\(/.test(content), false, 'submit call introduced');
assert.ok(content.includes('[contenteditable="true"]'), 'contenteditable support missing');

assert.ok(fieldKeys.indexOf('educationRank') < fieldKeys.indexOf('rank'), 'education rank must win exact matches');
assert.ok(fieldKeys.indexOf('otherLanguageLevel') < fieldKeys.indexOf('otherLanguage'), 'language level must win exact matches');
console.log('static regression passed');
