// Synthetic minimal structures from observed Kuaishou labels, no copied page DOM.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const profile=require('./fixtures/kuaishou-full-demo-profile.json').profile;
const sections=[
 ['educationBulk','教育经历',{educationSchool:'学校',educationCollege:'学院',educationLab:'实验室',educationMentor:'导师姓名',educationMajor:'专业',educationDegree:'学历',educationRank:'成绩排名',educationStartDate:'开始时间',educationEndDate:'结束时间'}],
 ['internshipsBulk','实习经历',{internshipCompany:'公司名称',internshipRole:'职位名称',internshipContent:'职责描述',internshipAchievement:'工作业绩',internshipStartDate:'开始时间',internshipEndDate:'结束时间'}],
 ['projectsBulk','项目经历',{projectName:'项目名称',projectRole:'职务',projectResponsibility:'项目职责',projectDescription:'项目描述',projectStartDate:'开始时间',projectEndDate:'结束时间'}],
 ['researchBulk','论文',{researchName:'论文名称',researchChannel:'发布渠道',researchAuthorOrder:'作者顺序',researchUrl:'论文链接'}],
 ['languagesBulk','语言能力',{languageType:'语种',languageSpeaking:'听说能力',languageWriting:'读写能力'}],
 ['skillsBulk','IT技能',{skillName:'技能类别',skillLevel:'掌握程度'}],
 ['certificatesBulk','技能证书',{certificateName:'技能证书'}],
 ['competitionsBulk','竞赛获奖',{competitionName:'竞赛名称',competitionLevel:'竞赛获奖等级',competitionDate:'竞赛获奖时间'}],
 ['honorsBulk','其他荣誉',{honorName:'荣誉名称'}],
 ['worksBulk','作品信息',{workName:'作品名称',workUrl:'作品链接'}],
];
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {for(const initial of [0,1]){
 const page=await browser.newPage();
 await page.route('**/*',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><form id="demo"></form>'}));
 await page.goto('https://fixture.invalid/kuaishou-coverage');
 await page.evaluate(({sections,profile,initial})=>{
 const form=document.querySelector('form');window.submits=0;form.onsubmit=e=>{e.preventDefault();submits++};
 const basic=document.createElement('div');basic.innerHTML='<div class="form-item"><label>最高学历学校</label><input id="highest-school"></div><div class="form-item"><label>性别</label><div class="ant-radio-group"><label class="ant-radio-wrapper"><input type="radio" name="gender" value="1">男</label><label class="ant-radio-wrapper"><input type="radio" name="gender" value="2">女</label></div></div>';form.append(basic);
 const choices=new Set(['educationDegree','languageType','languageSpeaking','languageWriting','researchAuthorOrder','skillName','skillLevel']);
 for(const [bulk,title,fields] of sections){
 const section=document.createElement('section');section.dataset.bulk=bulk;section.innerHTML='<h3>'+title+'</h3>';const add=document.createElement('button');add.type='button';add.textContent='添加';section.append(add);form.append(section);
 function append(){const row=document.createElement('div');row.className='record';for(const [key,label] of Object.entries(fields)){const wrap=document.createElement('div');wrap.className='form-item';const l=document.createElement('label');l.textContent=label;const input=document.createElement(choices.has(key)?'select':'input');input.dataset.key=key;if(choices.has(key)){input.add(new Option('请选择',''));for(const value of new Set(profile[bulk].map(r=>r[key]).filter(Boolean)))input.add(new Option(value,value));}else if(key.endsWith('Date'))input.type='date';wrap.append(l,input);row.append(wrap);}section.insertBefore(row,add);}
 add.onclick=append;for(let i=0;i<initial;i++)append();
 }
 const button=document.createElement('button');button.textContent='保存';form.append(button);
 const store={profile,settings:{},siteRules:{},learned:{}};
 window.chrome={storage:{local:{get:async()=>store,set:async d=>Object.assign(store,d)},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn}},sendMessage:async()=>({ok:true})}};
 window.request=m=>new Promise(resolve=>listener(m,null,resolve));
 },{sections,profile,initial});
 for(const file of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,file)});
 const result=await page.evaluate(()=>request({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false}));
 assert.equal(result.note,undefined,JSON.stringify(result));
 assert.equal(await page.locator('#highest-school').inputValue(),profile.school);
 assert.equal(await page.locator('input[name=gender]:checked').inputValue(),'1','unchecked radio values must not count as existing selection');
 for(const [bulk,,fields] of sections){const rows=page.locator(`[data-bulk="${bulk}"] .record`);assert.equal(await rows.count(),profile[bulk].length,bulk+' row count');for(let i=0;i<profile[bulk].length;i++)for(const key of Object.keys(fields)){const value=profile[bulk][i][key];if(!value)continue;assert.equal(await rows.nth(i).locator(`[data-key="${key}"]`).inputValue(),key.endsWith('Date')&&value.length===7?value+'-01':value,bulk+' '+i+' '+key);}}
 await page.evaluate(()=>request({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false}));
 for(const [bulk] of sections)assert.equal(await page.locator(`[data-bulk="${bulk}"] .record`).count(),profile[bulk].length,'retry must not duplicate '+bulk);
 assert.equal(await page.evaluate(()=>submits),0);console.log('PASS Kuaishou coverage fixture: initial '+initial+' rows, all 10 sections, record-local values, gender, school, idempotent retry, no save/submit');await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
