/* 仅供本地回归测试页使用，不会被扩展弹窗加载。 */
(() => {
  const defaults = {
    profile: {},
    settings: { aiProvider: 'openai', aiEnabled: false },
    learned: {},
    siteRules: {},
    aiSecrets: {},
  };
  let restored = {};
  try { restored = JSON.parse(sessionStorage.getItem('qiuzhao-popup-harness') || '{}'); } catch (error) { restored = {}; }
  const store = Object.assign({}, defaults, restored);
  const persist = () => sessionStorage.setItem('qiuzhao-popup-harness', JSON.stringify(store));
  const stats = { permissionRequests: 0, modelRequests: 0 };
  document.documentElement.dataset.permissionRequests = '0';
  document.documentElement.dataset.modelRequests = '0';

  globalThis.__popupHarness = { store, stats };
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (typeof keys === 'string') return structuredClone({ [keys]: store[keys] });
          const result = {};
          for (const key of keys || []) result[key] = store[key];
          return structuredClone(result);
        },
        async set(values) { Object.assign(store, structuredClone(values)); persist(); },
        async remove(keys) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete store[key];
          persist();
        },
        async clear() {
          for (const key of Object.keys(store)) delete store[key];
          persist();
        },
      },
    },
    permissions: {
      async request() {
        stats.permissionRequests += 1;
        document.documentElement.dataset.permissionRequests = String(stats.permissionRequests);
        return true;
      },
      async remove() { return true; },
    },
    runtime: {
      getURL: p=>new URL('../'+p,location.href).href,
      async sendMessage(message) {
        if(message.type==='PROFILE_COMMIT'){const writer=(globalThis.__profileWriter ||= QIUZHAO_PROFILE_UPDATES.createWriter(chrome.storage.local));return writer(message);}
        if (message && message.type === 'AI_LIST_MODELS') {
          stats.modelRequests += 1;
          document.documentElement.dataset.modelRequests = String(stats.modelRequests);
          return {
            ok: true,
            models: [
              { id: 'MiniMax-M2.7', name: 'MiniMax-M2.7' },
              { id: 'MiniMax-M2.5', name: 'MiniMax-M2.5' },
            ],
          };
        }
        if (message && message.type === 'AI_EXTRACT_PROFILE') {
          return {
            ok: true,
            profile: {
              name: '文档提取用户',
              internshipsBulk: [
                { internshipCompany: '文档示例公司', internshipRole: '产品实习生' },
                { internshipCompany: '表格示例公司', internshipRole: '运营实习生' },
              ],
            },
          };
        }
        return { ok: true };
      },
    },
    tabs: {
      async create({url}) { window.open(url); },
      async query() { return [{ id: 1 }]; },
      async sendMessage(_tabId, message) {
        if (message && message.type === 'PING') return { ok: true, host: 'test.local' };
        if (message && message.type === 'SCAN_FORM') return { totalControls: 8, ruleCandidates: 5, aiCandidates: 3, repeatSections: [], aiUsed: false };
        return { filled: [] };
      },
    },
  };
})();
