// Full extension message path on a synthetic local fixture. No live-site requests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const edu=(school,major,start)=>({educationSchool:school,educationMajor:major,educationStartDate:start});
const fields={educationSchool:'学校名称',educationMajor:'专业名称',educationStartDate:'开始时间'};
const markup=values=>'<div class="record">'+Object.entries(fields).map(([key,label])=>'<div class="form-item"><label>'+label+'</label><input data-key="'+key+'" value="'+(values[key]||'')+'"></div>').join('')+'</div>';
async function fixture(browser,records,rows,{delayed=false,ambiguous=false}={}){
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<style>.record{padding:12px}input{display:block}</style><aside><div>教育经历</div><div>工作经历</div></aside><form><div id="education"><div>教育经历</div><div id="rows">${rows.map(markup).join('')}</div><div id="random_edu_addButton"><span>添加教育经历</span></div></div><div id="work"><div>工作经历</div><div class="form-item"><label>公司名称</label><input id="company"></div><div id="random_work_addButton">添加工作经历</div></div><button id="save">保存</button><button id="submit">提交</button></form>`}));
 await page.goto('https://zhuanzhuan.zhiye.com/form?fromPage=editMyResume');
 await page.evaluate(({records,blank,delayed,ambiguous})=>{
  window.actions={adds:0,save:0,submit:0};
  document.querySelector('form').onsubmit=e=>e.preventDefault();
  document.querySelector('#save').onclick=()=>actions.save++;
  document.querySelector('#submit').onclick=()=>actions.submit++;
  document.querySelector('#random_edu_addButton').onclick=()=>{actions.adds++;setTimeout(()=>document.querySelector('#rows').insertAdjacentHTML('beforeend',blank),delayed?1800:20);};
  if(ambiguous){const copy=document.querySelector('#education').cloneNode(true);document.querySelector('form').append(copy);}
  const store={profile:{name:'演示用户',educationBulk:records,educationSchool:'不应使用的标量学校',internshipsBulk:[{internshipCompany:'演示实习单位'}],projectsBulk:[{projectName:'演示项目',projectDescription:'演示描述'}],awardsBulk:Array.from({length:20},()=>({awardName:'演示奖项',awardDate:'2020-09',awardLevel:'校级'}))},settings:{},learned:{},siteRules:{}};
  window.chrome={storage:{local:{get:async()=>store,set:async value=>Object.assign(store,value)},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async()=>({ok:true,mappings:[]})}};
  window.request=message=>new Promise(resolve=>listener(message,null,resolve));
 },{records,blank:markup({}),delayed,ambiguous});
 for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
 const run=()=>page.evaluate(()=>request({type:'FILL_FORM',overwrite:false,useAI:false,selfCheck:true}));
 const read=()=>page.locator('#rows .record').evaluateAll(nodes=>nodes.map(row=>Object.fromEntries(Array.from(row.querySelectorAll('input')).map(el=>[el.dataset.key,el.value]))));
 return {page,run,read,errors};
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 try{
  const A=edu('演示甲大学','甲专业','2020-09'),B=edu('演示乙大学','乙专业','2022-09'),C=edu('演示丙大学','丙专业','2024-09');
  let f=await fixture(browser,[A,B,C],[{educationSchool:B.educationSchool},{}]);
  const first=await f.run();assert.equal(first.note,undefined,JSON.stringify(first));
  assert.equal(first.diagnostics.filter(d=>d.reason==='repeat-section-unobserved').length,3,'three unobserved groups, not individual missing fields');
  assert.equal(first.diagnostics.filter(d=>d.reason==='record-container-unresolved').length,0);
  const firstStatus=await f.page.evaluate(()=>request({type:'GET_FILL_STATUS'}));
  assert.equal(firstStatus.summary.pending,first.selfCheck.items.filter(i=>i.status!=='verified').length+4,'only 3 missing groups + work mapping added');
  assert.deepEqual(await f.read(),[B,A,C]);assert.equal(await f.page.evaluate(()=>actions.adds),1);
  await f.run();assert.deepEqual(await f.read(),[B,A,C]);assert.equal(await f.page.evaluate(()=>actions.adds),1,'retry must not duplicate rows');
  assert.equal(await f.page.locator('#company').inputValue(),'','employment must not receive internship values');
  const status=await f.page.evaluate(()=>request({type:'GET_FILL_STATUS'}));
  assert(status.summary.pending>0);assert(status.pendingItems.some(item=>item.reason==='work-profile-mapping-required'));
  const report=await f.page.evaluate(()=>request({type:'GET_SELF_CHECK'}));
  assert(status.summary.pending>=report.report.items.filter(item=>item.status!=='verified').length);
  assert.deepEqual(await f.page.evaluate(()=>[actions.save,actions.submit]),[0,0]);assert.deepEqual(f.errors,[]);await f.page.close();
  console.log('PASS reorder, new record, idempotent retry, existing values, work boundary, pending report, no save/submit');
  for(const scenario of [
   {name:'partial record',records:[A],rows:[{educationMajor:'原有专业'}],expected:[{educationSchool:'',educationMajor:'原有专业',educationStartDate:''}]},
   {name:'duplicate source',records:[A,A],rows:[{}],expected:[{educationSchool:'',educationMajor:'',educationStartDate:''}]},
   {name:'duplicate destination',records:[A],rows:[{educationSchool:A.educationSchool},{educationSchool:A.educationSchool}]},
   {name:'ambiguous section',records:[A],rows:[{}],options:{ambiguous:true}}
  ]){
   f=await fixture(browser,scenario.records,scenario.rows,scenario.options);const before=await f.read();await f.run();
   assert.deepEqual(await f.read(),scenario.expected||before,scenario.name);assert.equal(await f.page.evaluate(()=>actions.adds),0);assert.deepEqual(f.errors,[]);await f.page.close();console.log('PASS '+scenario.name);
  }
  f=await fixture(browser,[A,B],[{}],{delayed:true});await f.run();assert.equal(await f.page.evaluate(()=>actions.adds),1,'late DOM must not cause repeated clicks');assert.deepEqual(f.errors,[]);await f.page.close();console.log('PASS delayed add stops safely');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
