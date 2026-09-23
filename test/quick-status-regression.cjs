// quick 侧栏三态显示回归：原因映射、四格统计、content 上报字段、quick.html 接线。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const QS=require('../shared/quick-status.js');
const content=fs.readFileSync(path.join(root,'content/content.js'),'utf8');
const quickHtml=fs.readFileSync(path.join(root,'popup/quick.html'),'utf8');
const quickJs=fs.readFileSync(path.join(root,'popup/quick.js'),'utf8');

// 1) 失败原因映射：已知码给出人话，未知码不编造。
assert.equal(QS.reasonText('page-plan-unavailable').code,'page-plan-unavailable');
assert.ok(QS.reasonText('Error: page-plan-capacity-exceeded').text.includes('上限'));
assert.equal(QS.reasonText('some-random-error').code,'some-random-error');
assert.ok(!QS.reasonText('some-random-error').text.includes('AI'));
assert.equal(QS.reasonText('').code,null);

// 2) 三态描述：running / finished / failure。
assert.equal(QS.describe({running:true}).tone,'running');
assert.equal(QS.describe({running:true,cancelled:true}).title,'正在停止');
assert.equal(QS.describe({running:false,outcome:'finished',summary:{pending:0}}).tone,'ok');
assert.equal(QS.describe({running:false,outcome:'finished',summary:{pending:2}}).title,'部分完成，2 项待核对');
const planFail=QS.describe({running:false,outcome:'fill-error',reason:'Error: page-plan-unavailable'});
assert.equal(planFail.tone,'danger');
assert.equal(planFail.code,'page-plan-unavailable');
assert.ok(planFail.title.includes('规划失败'),'规划失败标题应明说：'+planFail.title);
assert.ok(planFail.detail.includes('未做任何改动'),'规划失败应声明页面未改动');
assert.equal(QS.describe({running:false,outcome:'sensitive-page'}).title,'已跳过');
assert.equal(QS.describe({running:false,outcome:'fill-timeout'}).title,'运行超时');

// 3) 四格统计：全部来自真实字段，0 值不标 warn/danger。
const grid=QS.summaryGrid({summary:{verified:12,pending:0,skipped:3,pageEmpty:6}});
assert.deepEqual(grid.map(c=>c.value),[12,0,3,6]);
assert.equal(grid[1].tone,'muted','待核对为 0 时不应警示');
assert.equal(QS.summaryGrid({summary:{verified:0,pending:5}})[1].tone,'warn');

// 4) content.js 上报与透传字段存在。
assert.ok(content.includes('summary.reason = String(error.message)'),'失败原因捕获缺失');
assert.ok(content.includes('reason:finalResult.reason'),'lastManualStatus 未透传原因');
assert.ok(content.includes("planStep:'observe'")&&content.includes("planStep:'ai'")&&content.includes("planStep:'validate'"),'规划子步骤缺失');
assert.ok(content.includes('planCounts:{controls:controls.length'),'规划计数缺失');
assert.ok(content.includes('recordContext'),'填写上下文缺失');
assert.ok(content.includes('planStep:run.planStep'),'GET_FILL_STATUS 未上报 planStep');

// 5) quick 面板接线。
assert.ok(quickHtml.includes('../shared/quick-status.js'),'quick.html 未加载共享文案模块');
assert.ok(quickJs.includes('QIUZHAO_QUICK_STATUS'),'quick.js 未使用共享文案模块');
assert.ok(quickJs.includes("start({useAI:false})"),'规则模式重试按钮缺失');
assert.ok(!quickJs.includes('需核对 '),'旧的误导性 0/0 文案应移除');

console.log('quick-status regression ok');
