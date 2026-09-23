// Semantic labels from public Moka documentation, NOT a captured Moka page/DOM.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{for(const initial of [0,1]){
  const page=await browser.newPage();
  await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<form></form>'}));await page.goto('https://fixture.invalid/semantic-labels');
  const profile={internshipsBulk:[1,2].map(i=>({internshipCompany:'演示公司'+i,internshipRole:'实习生'+i,internshipContent:'演示职责'+i,internshipStartDate:'2024-0'+i,internshipEndDate:'2024-0'+(i+1)})),projectsBulk:[1,2].map(i=>({projectName:'演示项目'+i,projectDescription:'演示描述'+i,projectResponsibility:'演示职责'+i,projectStartDate:'2025-0'+i,projectEndDate:'2025-0'+(i+1)}))};
  await page.evaluate(({profile,initial})=>{
   window.saves=0;const form=document.querySelector('form');form.onsubmit=e=>{e.preventDefault();saves++;};
   for(const [bulk,title,fields] of [
    ['internshipsBulk','实习经验',{internshipCompany:'公司名称',internshipRole:'职位名称',internshipContent:'工作职责',internshipStartDate:'开始时间',internshipEndDate:'结束时间'}],
    ['projectsBulk','项目经验',{projectName:'项目名称',projectDescription:'项目描述',projectResponsibility:'项目职责',projectStartDate:'开始时间',projectEndDate:'结束时间'}]
   ]){
    const section=document.createElement('section');section.dataset.bulk=bulk;section.innerHTML='<h3>'+title+'</h3><button type="button">添加</button>';form.append(section);
    const button=section.querySelector('button');const add=()=>{const row=document.createElement('div');row.className='record';for(const [key,label] of Object.entries(fields)){const wrap=document.createElement('div');wrap.className='form-item';wrap.innerHTML='<label>'+label+'</label><input data-key="'+key+'">';row.append(wrap);}section.insertBefore(row,button);};button.onclick=add;for(let i=0;i<initial;i++)add();
   }
   const employment=document.createElement('section');employment.innerHTML='<h3>工作经验</h3><label>公司名称<input id="employment"></label>';form.append(employment);
   const save=document.createElement('button');save.textContent='提交';form.append(save);
   const store={profile,settings:{}};window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async()=>({ok:true})}};
  },{profile,initial});
  for(const file of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,file)});
  const fill=()=>page.evaluate(()=>new Promise(resolve=>listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve)));
  const result=await fill();assert.equal(result.selfCheck.counts.verified,20,JSON.stringify(result.selfCheck));
  for(const [bulk,records] of Object.entries(profile)){
   const rows=page.locator('[data-bulk="'+bulk+'"] .record');assert.equal(await rows.count(),2);
   for(let i=0;i<2;i++)for(const [key,value] of Object.entries(records[i]))assert.equal(await rows.nth(i).locator('[data-key="'+key+'"]').inputValue(),value);
  }
  assert.equal(await page.locator('#employment').inputValue(),'','formal employment must never be filled from internships');
  await fill();assert.equal(await page.locator('.record').count(),4);assert.equal(await page.evaluate(()=>saves),0);
  console.log('PASS documented section labels: initial '+initial+', 20 values across 4 records, no employment conflation or duplicate rows');await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
