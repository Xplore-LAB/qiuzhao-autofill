// Feishu tree multiselect: checkbox wallpaper is clickable; the transparent input is not.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});try{
 const page=await browser.newPage();await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:`<style>[hidden]{display:none!important}.ud__select,.ud__tree__node{width:250px;padding:10px}.ud__checkbox{display:inline-block;width:20px;height:20px;background:#ddd}.ud__checkbox__input{opacity:0}</style><div class="ud-formily-item"><div class="ud-formily-item-label">期望工作地点</div><div class="ud__select"><div class="ud__select__selector"><div class="ud__select__selector__content"><input role="combobox" type="search"></div></div></div></div><div class="ud__select__dropdown" hidden><div class="ud__tree__node"><span class="ud__checkbox"><input class="ud__checkbox__input" type="checkbox" role="checkbox" aria-checked="false"></span><span class="ud__tree__node__label">青岛</span></div></div><button id="save">完成</button>`}));await page.goto('https://fixture.invalid/feishu-multi');
 await page.evaluate(()=>{
  window.saves=0;window.choices=0;document.querySelector('#save').onclick=()=>saves++;
  const anchor=document.querySelector('.ud__select'),layer=document.querySelector('.ud__select__dropdown'),input=anchor.querySelector('input');
  anchor.querySelector('.ud__select__selector').onclick=()=>layer.hidden=false;
  anchor.onkeydown=e=>{if(e.key==='Escape')layer.hidden=true;};
  layer.querySelector('.ud__checkbox').onclick=()=>{choices++;input.value='';anchor.querySelector('.ud__select__selector__content').insertAdjacentHTML('afterbegin','<span class="ud__select__selector__tag"><div class="ud__tag__content">青岛</div></span>');};
  const store={profile:{expectedCity:'青岛'},settings:{}};window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async()=>({ok:true})}};
 });
 for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
 const fill=()=>page.evaluate(()=>new Promise(resolve=>listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve)));
 const result=await fill();assert.equal(result.selfCheck?.counts.verified,1,JSON.stringify(result.selfCheck));
 assert.equal(await page.locator('.ud__tag__content').textContent(),'青岛');await fill();assert.equal(await page.evaluate(()=>choices),1);assert.equal(await page.evaluate(()=>saves),0);assert.equal(await page.locator('.ud__select__dropdown:visible').count(),0);
 console.log('PASS Feishu multiselect: transparent checkbox, committed tag, no duplicate toggle or save');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
