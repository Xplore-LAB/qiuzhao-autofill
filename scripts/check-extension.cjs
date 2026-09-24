// Default extension quality gate. Fail closed; never download dependencies or visit live sites.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const unit=[
 'static-regression.mjs','final-target-regression.mjs','date-transaction-regression.mjs','missing-section-regression.mjs',
 'record-binding-regression.mjs','section-boundary-regression.mjs','page-order-regression.mjs','fill-follow-scroll-regression.mjs',
 'native-controls-regression.mjs','layer-ownership-regression.mjs','calendar-navigation-regression.mjs','fill-cancellation-regression.mjs',
 'site-observations-regression.cjs','run-timing-regression.cjs','settlement-speed-regression.cjs','settlement-reuse-regression.cjs','run-logs-regression.cjs','feedback-loop-regression.cjs',
 'default-profile-regression.cjs','profile-updates-regression.cjs','profile-json-import-regression.cjs',
 'applications-regression.cjs','frame-router-regression.cjs','workflow-races-regression.cjs','custom-field-matching-regression.cjs','ant-calendar-jump-regression.cjs',
 'quality-gate-regression.cjs','resume-parser-regression.cjs','matching-scope-speed-regression.cjs'
];
const browser=['phoenix-wait-speed-regression.cjs','ud-wait-speed-regression.cjs','recruitment-section-aliases-regression.cjs','phoenix-area-readiness-regression.cjs','phoenix-autocomplete-regression.cjs','feishu-multiselect-regression.cjs','feishu-controls-regression.cjs','feishu-fields-regression.cjs','hisense-browser-regression.cjs','native-wait-speed-regression.cjs','ant-wait-speed-regression.cjs','extension-lifecycle-regression.cjs','phoenix-close-browser-regression.cjs','choice-close-browser-regression.cjs','zhuanzhuan-extension-regression.cjs','quick-ui-regression.cjs','sidepanel-regression.cjs','profile-readiness-browser-regression.cjs','real-extension-workflow.cjs','kuaishou-coverage-regression.cjs','pdf-import-regression.cjs'];
const args=process.argv.slice(2),unitOnly=args.length===1&&args[0]==='--unit';
if(args.length&&!unitOnly){console.error('Usage: node scripts/check-extension.cjs [--unit]');process.exit(2);}
const tests=unitOnly?unit:unit.concat(browser);
const runtime=['manifest.json',...['content','shared','popup','background'].flatMap(dir=>fs.readdirSync(path.join(root,dir)).filter(f=>/\.(?:js|html|css)$/.test(f)).map(f=>dir+'/'+f))];
function files(dir){return fs.existsSync(path.join(root,dir))?fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(dir+'/'+entry.name):[dir+'/'+entry.name]):[];}
const inputs=[...runtime,...files('vendor'),'package.json',...(fs.existsSync(path.join(root,'package-lock.json'))?['package-lock.json']:[]),'scripts/check-extension.cjs','scripts/triage-run-logs.cjs',...unit.concat(browser).map(f=>'test/'+f),'test/popup-mock-chrome.js','test/extension-fixture.cjs','test/hisense/controls.html','test/hisense/controls.js','test/hisense/suite.css'].sort();
const fingerprint=()=>crypto.createHash('sha256').update(inputs.map(file=>file+':'+crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')).join('\n')).digest('hex');
const report={schema:1,at:new Date().toISOString(),extensionVersion:JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version,scope:unitOnly?'unit-only':'local-unit-and-browser-fixtures',liveSiteVerified:false,status:'failed',sourceSha256:null,results:[],notIncluded:['legacy-jsdom-suite','independent-playwright-benchmark','live-site-verification']};
const output=path.join(root,'artifacts',unitOnly?'quality-gate-unit.json':'quality-gate.json');
function run(label,file,args=[],scriptArgs=[]){
 const result=cp.spawnSync(process.execPath,[...args,path.join(root,file),...scriptArgs],{cwd:root,env:process.env,encoding:'utf8',timeout:file.endsWith('kuaishou-coverage-regression.cjs')?240000:120000,maxBuffer:4*1024*1024,windowsHide:true});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 report.results.push({name:label,passed:!result.error&&result.status===0});
 if(result.error||result.status!==0)throw Error('Failed: '+label+(result.error?' ('+result.error.code+')':''));
}
try{
 report.sourceSha256=fingerprint();
 if(!unitOnly){
  require.resolve('playwright');
  if(process.env.AUTOFILL_BROWSER_PATH&&!fs.existsSync(process.env.AUTOFILL_BROWSER_PATH))throw Error('AUTOFILL_BROWSER_PATH does not exist');
 }
 for(const file of runtime.filter(f=>f.endsWith('.js')))run('syntax:'+file,file,['--check']);
 for(const test of tests){console.log('\nCHECK '+test);run(test,'test/'+test,[],test==='applications-regression.cjs'&&!unitOnly?['--browser']:[]);}
 if(fingerprint()!==report.sourceSha256)throw Error('Inputs changed while tests were running; rerun the gate');
 report.status=unitOnly?'unit-only-passed':'passed';
 console.log('\n'+(unitOnly?'UNIT ONLY':'LOCAL GATE')+': PASS ('+tests.length+' test scripts); live site NOT verified.');
}catch(error){report.error=error.message;console.error('GATE FAILED: '+error.message);process.exitCode=1;}
finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log('Report: '+output);}
