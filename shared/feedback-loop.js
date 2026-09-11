/* Turn diagnostic metadata into investigation groups, never inferred fixes. */
(() => {
  const policies = {
    'no-visible-options': ['inspection', '未取得候选项', '核对搜索词与页面空态；可能是资料不在选项库，也可能是加载失败，勿直接认定控件故障。'],
    'no-matching-options': ['profile', '资料与候选项不匹配', '核对原始资料与网站选项；多个备选渠道需明确一个，不自动替换为相近选项。'],
    'ambiguous-options': ['inspection', '候选项存在歧义', '补充准确名称或人工选择；不按包含关系任选一个专业或学校。'],
    'missing-source': ['profile', '补充资料', '核对对应资料是否缺失；不修改控件适配器。'],
    'authentication-error': ['configuration', '检查 AI 配置', '核对厂商、区域和密钥权限；日志中不要附密钥。'],
    'configuration-error': ['configuration', '检查 AI 配置', '核对模型和启用状态，再重试一次。'],
    'rate-limited': ['configuration', '检查 AI 配置', '检查额度或限流，保留本地规则结果。'],
    'fill-cancelled': ['interrupted', '运行未完成', '用户停止不等于插件故障；保留已完成字段。'],
    'fill-timeout': ['interrupted', '运行未完成', '查看最后一个执行阶段，复现超时后再调整等待策略。'],
    'fill-error': ['interrupted', '运行未完成', '结合末尾事件定位异常，补充最小失败场景。'],
    'rows-not-created': ['adapter', '经历区块未创建完整', '复现添加经历按钮与区块边界；核对新增数量，不把创建成功当成填写成功。'],
    'value-reverted': ['verification', '填写后回退', '复现后续交互或异步回写；断言最终值，不只断言赋值事件。'],
    'control-replaced': ['verification', '页面重绘', '重现节点替换，核对重新定位和字段身份。'],
    'validation-rejected': ['verification', '网站校验拒绝', '区分资料格式错误与控件事件未被接受。'],
    'existing-unverified': ['inspection', '已有内容待核对', '先核对现有内容，不为获得通过状态覆盖用户输入。'],
  };
  const token = value => /^[a-zA-Z][a-zA-Z0-9_-]{0,69}$/.test(String(value || '')) ? String(value) : 'unknown';
  const hostName = value => /^[a-zA-Z0-9.-]{1,253}$/.test(String(value || '')) ? String(value) : 'unknown';
  const version = value => /^[0-9][0-9a-zA-Z.+()-]{0,59}$/.test(String(value || '')) ? value : 'unknown';
  const list = value => Array.isArray(value) ? value : [];
  function analyze(input) {
    const logs = list(Array.isArray(input) ? input : input?.logs).slice(0, 1000);
    const groups = new Map(), seenRuns = new Set();
    let incompleteRuns = 0, analyzedRuns = 0;
    for (const [index, log] of logs.entries()) {
      if (!log || typeof log !== 'object') continue;
      // Export order is newest first. Repeated checkpoints are one run.
      const runId = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(log.id || '') ? log.id : 'snapshot-' + index;
      if (seenRuns.has(runId)) continue;
      seenRuns.add(runId); analyzedRuns++;
      const incomplete = log.outcome === 'running' || log.verification !== 'final';
      if (incomplete) incompleteRuns++;
      const events = list(log.events).slice(0, 600);
      const observed = new Set();
      function add(item, source) {
        if (!item || item.status === 'verified') return;
        let reason = token(item.reason);
        if (item.status === 'missing') reason = 'missing-source';
        if (reason === 'stable-match') return;
        const fieldKey = token(item.fieldKey), host = hostName(log.host);
        const policy = (Object.hasOwn(policies, reason) ? policies[reason] : null) || (item.status === 'failed'
          ? ['adapter', '控件填写失败', '按控件和失败阶段采集最小复现，保留未知原因，不凭日志猜根因。']
          : ['inspection', '需要进一步核对', '定位字段，区分缺资料、未映射和未完成；必要时采集脱敏控件结构。']);
        const key = [host, fieldKey, reason, policy[0]].join('|');
        let group = groups.get(key);
        if (!group) {
          group = {key, host, fieldKey, reason, category:policy[0], title:policy[1], nextStep:policy[2],
            status:'observed', affectedRuns:0, versions:[], evidence:[]};
          groups.set(key, group);
        }
        if (!observed.has(key)) {group.affectedRuns++; observed.add(key);}
        const build = version(log.contentBuild || log.version);
        if (!group.versions.includes(build)) group.versions.push(build);
        if (group.evidence.length >= 8) return;
        const control = Number.isSafeInteger(item.control) && item.control > 0 ? item.control : 0;
        group.evidence.push({runId, build, source, control, final:!incomplete,
          stages:events.filter(e => e && control > 0 && e.control === control).slice(-8)
            .map(e => ({stage:token(e.stage), reason:token(e.reason), widget:token(e.widget)}))});
      }
      // Final field results override transient failures that recovered during execution.
      const items = list(log.items);
      const findings = !incomplete && items.length ? items : list(log.diagnostics);
      for (const item of findings) {
        if (item && ['failed','missing','manual'].includes(item.status)) add(item, !incomplete && items.length ? 'final-field' : 'diagnostic');
      }
      for (const section of list(log.repeats).slice(0, 30)) {
        if (section && Number.isSafeInteger(section.requested) && Number.isSafeInteger(section.after) && section.requested > section.after) {
          add({fieldKey:section.group, reason:'rows-not-created', status:'failed'}, 'repeat-section');
        }
      }
      if (['fill-cancelled','fill-timeout','fill-error'].includes(log.outcome)) {
        add({fieldKey:'run', reason:log.outcome, status:'manual'}, 'run');
      }
      // Configuration failures can matter even when local rules completed successfully.
      for (const event of events) {
        if (event && event.ok === false && Object.hasOwn(policies, event.reason) && policies[event.reason][0] === 'configuration') {
          add({fieldKey:'ai', reason:event.reason, status:'manual'}, 'ai');
        }
      }
    }
    const issues = [...groups.values()].sort((a,b) => b.affectedRuns - a.affectedRuns || a.key.localeCompare(b.key));
    return {schema:1, analyzedRuns, incompleteRuns, issues,
      limits:['同类问题分组不是唯一字段身份；需要复现确认根因。', '未再次出现不代表已修复；关闭问题需新版本实页复验。', '日志不包含资料值或完整 DOM，不能单独证明网站已保存。']};
  }
  const api = {analyze};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.QIUZHAO_FEEDBACK = api;
})();
