const assert = require('node:assert/strict');
const {analyze} = require('../shared/feedback-loop.js');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
const run = (n, extra={}) => ({id:id(n), host:'fixture.invalid', contentBuild:'1.15.0-dev', outcome:'finished', verification:'final', items:[], ...extra});
const failed = {fieldKey:'phone', control:1, status:'failed', reason:'value-reverted', value:'PRIVATE_VALUE'};
const logs = [
  run(3, {items:[{...failed,status:'verified',reason:'stable-match'}], diagnostics:[failed]}),
  run(2, {items:[failed, {...failed,control:2}], events:[{control:1,stage:'settlement-check',widget:'ant',value:'PRIVATE_VALUE'}]}),
  run(1, {items:[failed]}),
];
const report=analyze({logs});
assert.equal(report.issues.length,1);
assert.equal(report.issues[0].affectedRuns,2, 'duplicate fields count once per run, recovered transient failure is excluded');
assert.equal(report.issues[0].status,'observed', 'later success must not close a historical problem');
assert.equal(report.issues[0].evidence[0].stages[0].widget,'ant');
assert(!JSON.stringify(report).includes('PRIVATE_VALUE'));
const cases=analyze({logs:[
  run(4,{items:[{fieldKey:'school',status:'missing'}]}),
  run(5,{outcome:'fill-cancelled',verification:'incomplete'}),
  run(6,{events:[{ok:false,reason:'authentication-error',raw:'SECRET_KEY'}]}),
  run(7,{outcome:'running',verification:'incomplete'}),
  run(8,{host:'https://bad.invalid/?secret=SECRET_KEY',items:[failed]}),
  run(9,{repeats:[{group:'educationBulk',requested:2,after:1}]}),
]});
assert.equal(cases.incompleteRuns,2);
assert.deepEqual(new Set(cases.issues.map(i=>i.category)),new Set(['profile','interrupted','configuration','verification','adapter']));
assert(cases.issues.some(i=>i.host==='unknown'));
assert(!JSON.stringify(cases).includes('SECRET_KEY'));
const checkpoints=analyze({logs:[run(1,{items:[failed]}),run(1,{outcome:'running',verification:'incomplete'})]});
assert.equal(checkpoints.analyzedRuns,1);assert.equal(checkpoints.incompleteRuns,0);
assert.equal(analyze({logs:[null, {}, false]}).analyzedRuns,1);
assert.equal(analyze(null).issues.length,0);
assert.equal(analyze({logs:[run(10,{items:[{...failed,reason:'constructor'}]})]}).issues[0].category,'adapter');
const choices=analyze({logs:[run(11,{items:['no-visible-options','no-matching-options','ambiguous-options'].map((reason,i)=>({fieldKey:'educationMajor',control:i+1,status:'failed',reason}))})]});
assert.equal(choices.issues.length,3);
assert.equal(choices.issues.find(i=>i.reason==='no-matching-options').category,'profile');
assert(choices.issues.filter(i=>i.reason!=='no-matching-options').every(i=>i.category==='inspection'));
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'qiuzhao-feedback-test-'));
try {
  const file=path.join(directory,'logs.json');
  fs.writeFileSync(file,JSON.stringify({logs}));
  const result=cp.spawnSync(process.execPath,[path.join(__dirname,'../scripts/triage-run-logs.cjs'),file],{encoding:'utf8'});
  assert.equal(result.status,0);assert.equal(JSON.parse(result.stdout).issues[0].affectedRuns,2);
  fs.writeFileSync(file,'{"wrong":[]}');
  const invalid=cp.spawnSync(process.execPath,[path.join(__dirname,'../scripts/triage-run-logs.cjs'),file],{encoding:'utf8'});
  assert.equal(invalid.status,1);assert.equal(invalid.stdout,'');
} finally {fs.rmSync(directory,{recursive:true,force:true});}
console.log('PASS feedback loop: recovered failures, grouping, missing data, cancellation, unfinished runs, repeated rows, privacy and no inferred closure');
