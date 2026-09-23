// Test gate failure propagation using isolated synthetic files, not the real source tree.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict');
const runner=fs.readFileSync(path.join(__dirname,'../scripts/check-extension.cjs'),'utf8');
const unit=vm.runInNewContext(runner.match(/const unit=(\[[\s\S]*?\]);/)[1]);
const browser=vm.runInNewContext(runner.match(/const browser=(\[[\s\S]*?\]);/)[1]);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qiuzhao-gate-'));
const write=(file,text)=>{const dest=path.join(temp,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,text);};
try{
 for(const dir of ['content','shared','popup','background'])fs.mkdirSync(path.join(temp,dir),{recursive:true});
 write('manifest.json','{"version":"0.0.0"}');write('package.json','{}');write('content/demo.js','// fixture\n');
 write('scripts/check-extension.cjs',runner);write('scripts/triage-run-logs.cjs','');write('test/popup-mock-chrome.js','');write('test/extension-fixture.cjs','');
 for(const name of unit.concat(browser))write('test/'+name,'');
 const run=()=>{const p=cp.spawnSync(process.execPath,[path.join(temp,'scripts/check-extension.cjs'),'--unit'],{encoding:'utf8',timeout:30000,windowsHide:true});assert(!p.error,p.error?.message);return {code:p.status,report:JSON.parse(fs.readFileSync(path.join(temp,'artifacts/quality-gate-unit.json'),'utf8'))};};
 write('test/'+unit[0],'throw Error("intentional fixture failure");');
 let result=run();assert.notEqual(result.code,0);assert.equal(result.report.status,'failed');assert.equal(result.report.results.at(-1).passed,false);
 write('test/'+unit[0],'');result=run();assert.equal(result.code,0);assert.equal(result.report.status,'unit-only-passed');assert.equal(result.report.liveSiteVerified,false);
 write('test/'+unit[0],`import fs from 'node:fs';fs.appendFileSync('content/demo.js','// changed during run');`);
 result=run();assert.notEqual(result.code,0);assert.equal(result.report.status,'failed');assert(result.report.error.includes('Inputs changed'));
 console.log('PASS quality gate: fail propagation, unit-only scope, source fingerprint detects changes');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
