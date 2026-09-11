import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const providerSource = fs.readFileSync(path.join(root, 'shared/providers.js'), 'utf8');
const workerSource = fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8');
const listeners = {};
let stored = {
  settings: {
    aiEnabled: true,
    aiProvider: 'openai',
    aiModel: 'gpt-test',
  },
  aiSecrets: { keys: { openai: 'test-secret' } },
};
const capturedRequests = [];

const chrome = {
  contextMenus: {
    removeAll: callback => callback(),
    create: () => undefined,
    onClicked: { addListener: callback => { listeners.contextMenu = callback; } },
  },
  runtime: {
    getURL: value => 'chrome-extension://fixture/' + value,
    onInstalled: { addListener: callback => { listeners.installed = callback; } },
    onMessage: { addListener: callback => { listeners.message = callback; } },
  },
  commands: { onCommand: { addListener: callback => { listeners.command = callback; } } },
  tabs: { sendMessage: async () => undefined, query: async () => [] },
  storage: { local: { get: async () => structuredClone(stored), set: async values => Object.assign(stored, structuredClone(values)) } },
};

const context = {
  chrome,
  URL,
  AbortController,
  setTimeout,
  clearTimeout,
  importScripts: () => undefined,
  fetch: async (url, options) => {
    capturedRequests.push({ url, options });
    let requestPayload = {};
    try {
      const requestBody = JSON.parse(options.body || '{}');
      requestPayload = JSON.parse(requestBody.input || (requestBody.messages && requestBody.messages[requestBody.messages.length - 1].content) || '{}');
    } catch (error) { /* GET or non-JSON test request */ }
    const content = requestPayload.mode === 'page-overview'
      ? '{"recognizedControlIds":["0"],"ambiguousControlIds":["1","bad"],"repeatSections":[{"label":"获奖情况","category":"award","confidence":0.96}]}'
      : '{"mappings":[{"controlId":"0","fieldKey":"school","confidence":0.93}]}';
    const response = options.method === 'GET'
      ? { data: [{ id: 'gpt-test' }, { id: 'text-embedding-test' }] }
      : { choices: [{ message: { content } }] };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(response),
    };
  },
};

vm.runInNewContext(providerSource, context);
vm.runInNewContext(fs.readFileSync(path.join(root,'shared/profile-updates.js'),'utf8'), context);
vm.runInNewContext(workerSource + '\n;globalThis.__aiTest = { validateEndpoint, extractAiText, parseAiMappings, buildAiBody, requestAiMappings, requestAiPageOverview, listProviderModels, parseModelList, providerHeaders, normalizeApiKey, parseJsonObject, sanitizeExtractedProfile };', context);
const api = context.__aiTest;

assert.equal(api.normalizeApiKey('sk-test_1234567890'), 'sk-test_1234567890');
assert.equal(api.normalizeApiKey('Bearer sk-test_1234567890'), 'sk-test_1234567890');
assert.equal(api.normalizeApiKey('API 密钥：sk-test_1234567890 请复制'), 'sk-test_1234567890');
assert.equal(api.normalizeApiKey('\u200Bsk-test_1234567890\uFEFF'), 'sk-test_1234567890');
assert.throws(() => api.normalizeApiKey('这不是有效密钥'), /格式不正确/);

assert.equal(api.validateEndpoint('https://example.test/v1/chat/completions'), 'https://example.test/v1/chat/completions');
assert.equal(api.validateEndpoint('http://127.0.0.1:11434/v1/chat/completions'), 'http://127.0.0.1:11434/v1/chat/completions');
assert.throws(() => api.validateEndpoint('http://example.test/v1/chat/completions'));
assert.throws(() => api.validateEndpoint('https://user:pass@example.test/v1/chat/completions'));

const payload = {
  controls: [{ id: '0', label: '学校名称', kind: 'autocomplete', options: [] }],
  fields: [{ key: 'school', label: '毕业院校' }],
};
const filtered = api.parseAiMappings('{"mappings":[{"controlId":"0","fieldKey":"school","confidence":0.9},{"controlId":"9","fieldKey":"phone","confidence":1}]}', payload);
assert.deepEqual(JSON.parse(JSON.stringify(filtered)), [{ controlId: '0', fieldKey: 'school', value: '', confidence: 0.9 }]);
const mixed = api.parseAiMappings('<think>先分析字段</think>\n{"mappings":[{"controlId":"0","fieldKey":"school","confidence":0.91}]}\n处理完成', payload);
assert.deepEqual(JSON.parse(JSON.stringify(mixed)), [{ controlId: '0', fieldKey: 'school', value: '', confidence: 0.91 }]);
const trailingJson = api.parseAiMappings('{"mappings":[{"controlId":"0","fieldKey":"school","confidence":0.92}]}\n{"note":"done"}', payload);
assert.deepEqual(JSON.parse(JSON.stringify(trailingJson)), [{ controlId: '0', fieldKey: 'school', value: '', confidence: 0.92 }]);

const mappedValue = api.parseAiMappings('{"mappings":[{"controlId":"0","fieldKey":"school","value":"演示大学","confidence":0.95}]}', payload);
assert.deepEqual(JSON.parse(JSON.stringify(mappedValue)), [{ controlId: '0', fieldKey: 'school', value: '演示大学', confidence: 0.95 }]);

const modelResult = await api.listProviderModels('openai');
assert.deepEqual(JSON.parse(JSON.stringify(modelResult.models)), [{ id: 'gpt-test', name: 'gpt-test' }]);
assert.equal(capturedRequests[0].url, 'https://api.openai.com/v1/models');
assert.equal(capturedRequests[0].options.headers.Authorization, 'Bearer test-secret');

const mappings = await api.requestAiMappings(payload);
assert.deepEqual(JSON.parse(JSON.stringify(mappings)), [{ controlId: '0', fieldKey: 'school', value: '', confidence: 0.93 }]);
assert.equal(capturedRequests[1].url, 'https://api.openai.com/v1/responses');
assert.equal(capturedRequests[1].options.headers.Authorization, 'Bearer test-secret');
const body = JSON.parse(capturedRequests[1].options.body);
assert.equal(body.model, 'gpt-test');
assert.equal(body.input, JSON.stringify(payload));
assert.equal(body.input.includes('test-secret'), false);

const pageOverview = await api.requestAiPageOverview({
  page: { host: 'jobs.example.test' },
  controls: [{ id: '0', label: '奖项名称' }, { id: '1', label: '请选择' }],
  repeatSections: [{ label: '获奖情况', rows: 1, records: 3 }],
});
assert.deepEqual(JSON.parse(JSON.stringify(pageOverview)), {
  recognizedControlIds: ['0'],
  ambiguousControlIds: ['1'],
  repeatSections: [{ label: '获奖情况', category: 'award', confidence: 0.96 }],
});
const overviewBody = JSON.parse(capturedRequests[2].options.body);
assert.equal(overviewBody.input.includes('test-secret'), false);
assert.equal(overviewBody.input.includes('page-overview'), true);

const anthropicHeaders = api.providerHeaders({ auth: 'anthropic' }, 'claude-secret');
assert.equal(anthropicHeaders['x-api-key'], 'claude-secret');
assert.equal(anthropicHeaders['anthropic-version'], '2023-06-01');
assert.equal(anthropicHeaders['anthropic-dangerous-direct-browser-access'], 'true');

const anthropicBody = api.buildAiBody({ protocol: 'anthropic' }, 'claude-test', payload);
assert.equal(anthropicBody.model, 'claude-test');
assert.equal(anthropicBody.messages[0].content, JSON.stringify(payload));
assert.equal(api.extractAiText({ content: [{ type: 'text', text: '{"mappings":[]}' }] }), '{"mappings":[]}');
assert.equal(api.extractAiText({ output: [{ content: [{ type: 'output_text', text: '{"mappings":[]}' }] }] }), '{"mappings":[]}');

const geminiModels = api.parseModelList({
  models: [
    { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  ],
});
assert.deepEqual(JSON.parse(JSON.stringify(geminiModels)), [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
]);

const minimaxModels = api.parseModelList({
  data: [
    { id: 'MiniMax-M2.7' },
    { id: 'speech-2.8-hd' },
    { id: 'image-01' },
    { id: 'Music-2.6' },
  ],
});
assert.deepEqual(JSON.parse(JSON.stringify(minimaxModels)), [
  { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7' },
]);

const extracted = api.sanitizeExtractedProfile(api.parseJsonObject('<think>ignore</think>\n{"profile":{"name":"演示用户","unknown":"drop","internshipsBulk":[{"internshipCompany":"演示科技","unknown":"drop"}]}}\n完成'));
assert.deepEqual(JSON.parse(JSON.stringify(extracted)), {
  name: '演示用户',
  internshipsBulk: [{ internshipCompany: '演示科技' }],
});

stored = {
  settings: { aiEnabled: true, aiProvider: 'minimax', aiModel: 'MiniMax-M2.7' },
  aiSecrets: { keys: { minimax: 'minimax-secret' } },
};
const minimaxResult = await api.listProviderModels('minimax');
assert.deepEqual(JSON.parse(JSON.stringify(minimaxResult.models)), [{ id: 'gpt-test', name: 'gpt-test' }]);
const minimaxRequest = capturedRequests.at(-1);
assert.equal(minimaxRequest.url, 'https://api.minimaxi.com/v1/models');
assert.equal(minimaxRequest.options.headers.Authorization, 'Bearer minimax-secret');

stored = { settings: { aiEnabled: false }, aiSecrets: {} };
await assert.rejects(() => api.requestAiMappings(payload), /尚未启用/);

stored.profile={name:'演示旧姓名'};
const commitResponse=await new Promise(resolve=>listeners.message({type:'PROFILE_COMMIT',expected:stored.profile,next:{name:'演示新姓名'}},{url:chrome.runtime.getURL('popup/popup.html?manage=1')},resolve));
assert.equal(commitResponse.ok,true);assert.equal(stored.profile.name,'演示新姓名');
const rejectedResponse=await new Promise(resolve=>listeners.message({type:'PROFILE_COMMIT',expected:stored.profile,next:{}},{url:'https://fixture.invalid/'},resolve));
assert.equal(rejectedResponse.ok,false);assert.equal(stored.profile.name,'演示新姓名');
stored.settings.overwrite=true;
const entryMessages=[];
chrome.tabs.query=async()=>[{id:1}];chrome.tabs.sendMessage=async(id,message)=>entryMessages.push(message);
await listeners.command('fill-current-page');
listeners.contextMenu({menuItemId:'qiuzhao-fill'}, {id:1});await new Promise(resolve=>setImmediate(resolve));
assert.equal(entryMessages.length,2);assert(entryMessages.every(message=>message.overwrite===false));
console.log('AI adapter and worker entry regression passed: profile commit, sender restriction, safe shortcut/context menu defaults');
