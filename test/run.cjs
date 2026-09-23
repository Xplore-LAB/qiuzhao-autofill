const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {run} = require('../src/engine.cjs');
const {PlaywrightTool} = require('../src/playwright-tool.cjs');
const {observePage} = require('../src/observe.cjs');

const root = path.resolve(__dirname,'..');
const profile = {name:'演示同学',email:'demo@example.com',school:'浙江大学',range:{start:'2024-07-01',end:'2024-09-30'},region:['广东省','深圳市','南山区'],educations:[{school:'本科院校'},{school:'硕士院校'}],frameName:'框架演示',shadowName:'影子演示'};

(async()=>{
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(__dirname,'fixture.html')))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 const reports=[];
 try {
  browser=await chromium.launch({headless:true, ...(process.env.AUTOFILL_BROWSER_PATH ? {executablePath:process.env.AUTOFILL_BROWSER_PATH} : {})});
  for(const mode of ['happy','missing-option','ambiguous','rollback','late-rollback','invalid-email']){
   const page=await browser.newPage();page.setDefaultTimeout(1800);
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(`http://127.0.0.1:${server.address().port}/?case=${mode}`);
   const testProfile=mode==='invalid-email'?{...profile,email:'invalid'}:profile;
   const report=await run(new PlaywrightTool(page),testProfile,{repeats:{section:'教育经历',addButton:'添加教育经历'}});
   assert.deepEqual(errors,[],`${mode}: fixture script errors`);
   // Independently authored expected census, including manual/blocked controls.
   assert.equal(report.results.length,13,`${mode}: requirement census`);
   assert.equal(report.results.filter(r=>r.required).length,13);
   const status=id=>report.results.find(r=>r.id===id)?.status;
   assert.equal(status('0:file'),'manual');assert.equal(status('0:consent'),'manual');
   assert.equal(status('0:disabled'),'blocked');assert.equal(status('0:slider'),'unsupported');
   assert.equal(status('0:name'),['rollback','late-rollback'].includes(mode)?'failed':'verified');
   assert.equal(status('0:school'),['missing-option','ambiguous'].includes(mode)?'failed':'verified');
   assert.equal(status('0:email'),mode==='invalid-email'?'failed':'verified');
   assert.equal(status('0:range'),'verified');assert.equal(status('0:region'),'verified');
   assert.equal(status('0:education-0'),'verified');assert.equal(status('0:education-1'),'verified');
   assert.equal(status('1:frame-name'),'verified');assert.equal(status('0:shadow-name'),'verified');
   const model=await page.evaluate(()=>window.model);
   assert.deepEqual(model.educations,profile.educations,`${mode}: repeated record association`);
   assert.deepEqual(model.range,profile.range,`${mode}: committed range, not draft`);
   assert.deepEqual(model.region,profile.region,`${mode}: cascade leaf committed`);
   if(!['missing-option','ambiguous'].includes(mode))assert.equal(model.school,profile.school);
   else assert.equal(model.school,undefined,`${mode}: must not choose arbitrary option`);
   assert.equal(model.submitClicks,0);assert.equal(report.complete,false);
   assert.equal(await page.locator('#file').inputValue(),'');assert.equal(await page.locator('#consent').isChecked(),false);
   assert.equal((await observePage(page)).length,13);
   report.case=mode;report.assertions='passed';reports.push(report);
   if(mode==='happy') {fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});await page.screenshot({path:path.join(root,'artifacts','happy.png'),fullPage:true});}
   await page.close();
  }
  fs.writeFileSync(path.join(root,'artifacts','results.json'),JSON.stringify({tool:'Playwright',version:require('playwright/package.json').version,scope:'self-authored semantic browser fixtures; not live recruitment sites',reports},null,2));
  console.log(JSON.stringify(reports.map(r=>({case:r.case,requirements:r.results.length,verified:r.results.filter(f=>f.status==='verified').length,complete:r.complete,assertions:r.assertions})),null,2));
 } finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
