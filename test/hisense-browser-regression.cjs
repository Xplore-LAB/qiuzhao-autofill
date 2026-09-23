// Execute the existing sanitized Phoenix scenarios with real Chromium layout.
// Network and profile are isolated; this is not a live Hisense acceptance test.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{for(const mode of ['happy','missing-option','rollback']){
  const page=await browser.newPage();
  const html=fs.readFileSync(path.join(__dirname,'hisense/controls.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<link[^>]*>/g,'');
  await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:html}));
  await page.goto('https://fixture.invalid/hisense?case='+mode);
  await page.addStyleTag({path:path.join(__dirname,'hisense/suite.css')});
  await page.addScriptTag({path:path.join(__dirname,'hisense/controls.js')});
  await page.evaluate(()=>{chrome.runtime.sendMessage=async message=>{
   if(['LOAD_DEFAULT_PROFILE','SAVE_RUN_LOG','SAVE_SITE_OBSERVATION'].includes(message.type))return {ok:true};
   throw Error('Unexpected message: '+message.type);
  };});
  for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
  await page.evaluate(()=>runHisense());
  const result=await page.evaluate(()=>__hisenseReport);
  assert.equal(result.pass,true,JSON.stringify({mode,error:result.error,failures:result.checks?.filter(c=>!c.pass),note:result.summary?.note}));
  console.log('PASS Hisense browser behavior: '+mode+' ('+result.checks.length+' assertions, simulated persistence only)');
  await page.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
