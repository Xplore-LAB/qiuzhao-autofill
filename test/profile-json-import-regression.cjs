const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../popup/popup.js'), 'utf8');
const code = source.slice(source.indexOf('async function importData(e)'), source.indexOf('async function clearData()'));
async function run(data, size = 100) {
  const calls = [], errors = [];
  const context = {stageProfileUpdate: async (...args) => calls.push(args), selectProfileTab() {}, workflowStatus: text => errors.push(text)};
  vm.createContext(context); vm.runInContext(code, context);
  await context.importData({target: {files: [{size, text: async () => JSON.stringify(data)}], value: 'fixture'}});
  return {calls, errors};
}
(async () => {
  const profile = {name: '演示姓名', awardsBulk: [{awardName: '演示奖励'}]};
  let result = await run({app:'qiuzhao-autofill', kind:'structured-profile', schemaVersion:1, profile, metadata:{note:'not a field'}});
  assert.equal(result.calls.length, 1); assert.deepEqual(JSON.parse(JSON.stringify(result.calls[0][0])), profile);
  assert.equal(result.calls[0][1], '导入结构化资料');
  result = await run({app:'qiuzhao-autofill', version:5, profile}); assert.equal(result.calls.length,1);
  for (const data of [{app:'other',profile},{kind:'structured-profile',schemaVersion:2,profile},{}]) {
    result=await run(data); assert.equal(result.calls.length,0); assert.equal(result.errors.length,1);
  }
  result=await run({profile},6*1024*1024); assert.equal(result.calls.length,0);
  console.log('profile JSON import: 6 scenarios passed (demo data only)');
})().catch(error => {console.error(error);process.exitCode=1;});
