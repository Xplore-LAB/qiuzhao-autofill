/* Collect one value-free report per document; never broadcast a write. */
(function(root) {
  function createRouter(tabs, { timeout = 650, id = () => crypto.randomUUID() } = {}) {
    const pending = new Map();
    function report(message, sender) {
      const request = pending.get(message.requestId);
      if (!request || sender.tab?.id !== request.tabId || !Number.isInteger(sender.frameId)) return false;
      const data = message.frame || {};
      if (typeof data.contentBuild !== 'string') return false;
      let host = '';
      try { host = new URL(sender.url).host; } catch { /* opaque frame */ }
      request.frames.set(sender.frameId, {
        frameId: sender.frameId, documentId: sender.documentId || null, host,
        contentBuild: data.contentBuild.slice(0, 80),
        totalControls: Math.max(0, Math.min(10000, Number(data.totalControls) || 0)),
        sensitive: data.sensitive === true,
      });
      return true;
    }
    function discover(tabId) {
      if (!Number.isInteger(tabId) || tabId < 0) return Promise.reject(Error('页面编号无效'));
      return new Promise(resolve => {
        const requestId = id(), frames = new Map();
        const finish = () => {
          clearTimeout(timer); pending.delete(requestId);
          resolve([...frames.values()].sort((a, b) => a.frameId - b.frameId));
        };
        const timer = setTimeout(finish, timeout);
        pending.set(requestId, { tabId, frames });
        Promise.resolve().then(() => tabs.sendMessage(tabId, { type: 'PROBE_FORM_FRAMES', requestId }))
          .catch(() => { if (!frames.size) finish(); });
      });
    }
    return { discover, report };
  }
  const api = { createRouter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QIUZHAO_FRAME_ROUTER = api;
})(globalThis);
