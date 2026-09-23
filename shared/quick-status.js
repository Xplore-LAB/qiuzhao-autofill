/* Outcome and reason wording shared by the quick panel and tests. No DOM here. */
(function(root) {
  // 失败原因码 → 人话。未知码保守处理，不编造细节。
  const REASONS = {
    'page-plan-unavailable': 'AI 规划失败：模型未在时限内返回有效计划。页面未做任何改动。',
    'page-plan-capacity-exceeded': '页面字段或区块数量超出规划上限，已停止，未开始填写。',
    'fill-timeout': '运行超时，已退出。已完成项保留，剩余字段未填写。',
    'fill-cancelled': '已停止。此前已填内容保留。',
    'sensitive-page': '页面包含密码输入框（疑似登录页），插件不会扫描或填写。',
    'non-application-page': '当前页面不像网申表单，未开始填写。',
    'fill-error': '填写过程中出现异常，已退出。请查看日志定位。',
  };
  function reasonText(raw) {
    const text=String(raw||'');
    for(const code of Object.keys(REASONS))if(text.includes(code))return {code,text:REASONS[code]};
    return {code:text||null,text:text?'运行未完成：'+text:''};
  }
  function describe(status) {
    if(!status)return {tone:'muted',title:'等待开始',detail:''};
    if(status.running)return {tone:'running',title:status.cancelled?'正在停止':null,detail:''};
    const outcome=status.outcome||'';
    if(outcome==='finished'||outcome==='') {
      const pending=Number(status.summary&&status.summary.pending)||0;
      return {tone:pending?'warn':'ok',title:pending?'部分完成，'+pending+' 项待核对':'本轮完成',
        detail:pending?'待核对项与原因见日志，可在网页上逐项处理。':'请回到网页核对实际内容，并在网站自行保存。'};
    }
    const reason=reasonText(outcome==='fill-error'?(status.reason||outcome):outcome);
    const known=!!REASONS[reason.code];
    return {tone:'danger',title:known?titleFor(reason.code):'未完成',
      detail:reason.text||'请查看日志了解原因。',code:reason.code};
  }
  function titleFor(code) {
    if(code==='page-plan-unavailable'||code==='page-plan-capacity-exceeded')return '未开始填写：规划失败';
    if(code==='sensitive-page'||code==='non-application-page')return '已跳过';
    if(code==='fill-timeout')return '运行超时';
    if(code==='fill-cancelled')return '已停止';
    return '运行异常';
  }
  // 四格统计：全部来自真实计数字段，缺失项显示为 0 而不编造。
  function summaryGrid(status) {
    const s=(status&&status.summary)||{};
    const n=v=>Number.isFinite(Number(v))?Number(v):0;
    return [
      {label:'已核验',value:n(s.verified),tone:'ok'},
      {label:'待核对',value:n(s.pending),tone:n(s.pending)?'warn':'muted'},
      {label:'跳过非空',value:n(s.skipped),tone:'muted'},
      {label:'页面空白',value:n(s.pageEmpty),tone:'muted'},
    ];
  }
  const api={reasonText,describe,summaryGrid};
  root.QIUZHAO_QUICK_STATUS=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
