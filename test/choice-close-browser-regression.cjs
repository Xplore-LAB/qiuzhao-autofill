const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{for(const mode of ['single','multi','rollback','blocked']){
  const page=await browser.newPage();
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<style>.phoenix-select{padding:12px;width:240px}[hidden]{display:none!important}</style><div class="form-item"><label>最高学历</label><div id="degree" class="phoenix-select" aria-controls="choices"><span class="phoenix-select__singleValue"></span></div></div><div id="choices" role="listbox" hidden><div role="option">本科</div></div>'}));
  await page.goto('https://fixture.invalid/form');
  await page.evaluate(mode=>{
   const anchor=document.querySelector('#degree'),layer=document.querySelector('#choices'),option=layer.firstElementChild;
   window.clicks={anchor:0,option:0};
   anchor.onclick=()=>{clicks.anchor++;if(layer.hidden)layer.hidden=false;else if(mode!=='blocked'){layer.hidden=true;if(mode==='rollback')anchor.firstElementChild.textContent='';}};
   option.onclick=()=>{clicks.option++;const selected=option.getAttribute('aria-selected')==='true';option.setAttribute('aria-selected',String(!selected));anchor.firstElementChild.textContent=selected&&mode==='multi'?'':'本科';};
   const store={profile:{degree:'本科'},settings:{}};
   window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async()=>({ok:true})}};
  },mode);
  for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
  const result=await page.evaluate(()=>new Promise(resolve=>listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve)));
  const item=result.selfCheck.items.find(i=>i.fieldKey==='degree');
  assert.equal(await page.evaluate(()=>clicks.option),1,'never click selected option again');
  if(mode==='single'||mode==='multi'){assert.equal(item.status,'verified');assert.equal(await page.locator('#choices').isVisible(),false,'successful choice must be closed');}
  if(mode==='rollback')assert.notEqual(item.status,'verified','close rollback must not count as success');
  if(mode==='blocked')assert.equal(item.reason,'choice-layer-close-blocked');
  console.log('PASS choice close: '+mode);await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
