// Sanitized structures observed on the Xiaopeng Feishu resume editor.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.AUTOFILL_BROWSER_PATH});
 const measurements=[];
 try{for(const initial of [0,1]){
  const page=await browser.newPage();
  await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<style>[hidden]{display:none!important}.ud__select{width:220px;padding:10px}.ud-formily-item{margin:8px}</style><main></main><button id="save">完成</button>'}));
  await page.goto('https://fixture.invalid/feishu');
  await page.evaluate(initial=>{
   window.saves=0;document.querySelector('#save').onclick=()=>saves++;
   const field=(label,control)=>`<div class="ud-formily-item" data-form-field-i18n-name="${label}"><div class="ud-formily-item-label">${label}</div>${control}</div>`;
   const text=label=>field(label,'<input>');
   const choice=(label,options)=>field(label,`<div class="ud__select" data-options='${JSON.stringify(options)}'><div class="ud__select__selector"><div class="ud__select__selector__content"><div class="ud__select__selector__placeholder"></div><div class="ud__select__selector__search"><input readonly role="combobox" type="search"></div></div></div></div>`);
   const dates=()=>field('起止时间','<div class="throne-biz-date-range-picker-wrapper"><div class="throne-biz-date-range-picker-input"><input></div><div class="throne-biz-date-range-picker-input"><input></div></div>');
   const edu=()=>field('学校名称','<div class="ud__select"><div class="ud__input"><label><input data-form-field-name="school"></label></div></div>')+choice('学历',['高中','本科'])+choice('学历类型',['统招全日制'])+text('专业')+dates();
   const work=()=>text('作品链接')+field('描述','<textarea></textarea>');
   const award=()=>text('获奖名称')+field('获奖时间','<input class="ud__picker-input" placeholder="YYYY">')+field('描述','<textarea></textarea>');
   const project=()=>text('项目名称')+text('项目角色')+dates()+text('项目链接')+field('描述','<textarea></textarea>');
   const lang=()=>choice('语言',['英语','日语'])+choice('精通程度',['熟练','入门']);
   const main=document.querySelector('main');
   main.innerHTML=choice('期望工作地点',['中国大陆','山东','青岛']);
   const city=main.querySelector('.ud__select');city.querySelector('input').readOnly=false;city.dataset.tree='1';
   function mountChoices(row){for(const anchor of row.querySelectorAll('.ud__select')){
    const layer=document.createElement('div');layer.className='ud__select__dropdown';layer.hidden=true;document.body.append(layer);
    for(const value of JSON.parse(anchor.dataset.options||'[]')){const option=document.createElement('div');option.className=anchor.dataset.tree?'ud__tree__node':'ud__select__list__item';option.innerHTML=anchor.dataset.tree?'<span class="ud__tree__node__label">'+value+'</span>':value;layer.append(option);option.onclick=()=>{anchor.querySelector('.ud__select__selector__placeholder,.ud__select__selector__selectItem').outerHTML=`<div class="ud__select__selector__selectItem">${value}</div>`;layer.hidden=true;};}
    if(!anchor.querySelector('.ud__select__selector'))continue;
    anchor.querySelector('.ud__select__selector').onclick=()=>{layer.hidden=!layer.hidden;};
    anchor.onkeydown=e=>{if(e.key==='Escape')layer.hidden=true;};
   }}
   mountChoices(main);
   for(const [label,make] of [['教育经历',edu],['语言能力',lang],['作品',work],['获奖',award],['项目经历',project]]){
    const section=document.createElement('div');section.className='applyFormModuleWrapper__fixture';section.innerHTML=`<div class="applyFormModuleWrapper-left">${label}</div><div class="applyFormModuleWrapper-right"><div class="rows"></div><button>添加</button></div>`;main.append(section);
    const add=()=>{const row=document.createElement('div');row.className='apply-form-array-card__fixture';row.innerHTML=make();section.querySelector('.rows').append(row);mountChoices(row);};section.querySelector('button').onclick=add;
    for(let i=0;i<initial;i++)add();
   }
   const store={profile:{expectedCity:'青岛',educationBulk:[{educationSchool:'演示高中',educationMajor:'理科',educationDegree:'高中',educationType:'统招全日制',educationStartDate:'2019-09',educationEndDate:'2022-06'},{educationSchool:'演示大学',educationMajor:'计算机',educationDegree:'本科',educationType:'统招全日制',educationStartDate:'2022-09',educationEndDate:'2026-06'}],languagesBulk:[{languageType:'英语',languageProficiency:'熟练'},{languageType:'日语',languageProficiency:'入门'}]},settings:{}};
   store.profile.worksBulk=[1,2].map(i=>({workName:'unused'+i,workUrl:'https://example.com/work'+i,workDescription:'演示作品'+i}));
   store.profile.awardsBulk=[1,2].map(i=>({awardName:'演示奖项'+i,awardDate:'202'+i+'-05',awardDescription:'演示获奖'+i}));
   store.profile.projectsBulk=[1,2].map(i=>({projectName:'演示项目'+i,projectRole:'开发'+i,projectStartDate:'202'+i+'-01',projectEndDate:'202'+i+'-06',projectUrl:'https://example.com/project'+i,projectDescription:'演示描述'+i}));
   window.chrome={storage:{local:{get:async()=>store,set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){window.listener=fn;}},sendMessage:async()=>({ok:true})}};
  },initial);
  for(const script of JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).content_scripts[0].js)await page.addScriptTag({path:path.join(root,script)});
  const fill=()=>page.evaluate(()=>new Promise(resolve=>listener({type:'FILL_FORM',overwrite:false,selfCheck:true,useAI:false},null,resolve)));
  const started=Date.now();const result=await fill();
  measurements.push({initialRows:initial,elapsedMs:Date.now()-started,verified:result.selfCheck?.counts.verified,version:JSON.parse(fs.readFileSync(path.join(root,'manifest.json'))).version});
  assert.equal(result.selfCheck?.counts.verified,39,JSON.stringify(result));
  const snapshot=()=>page.evaluate(()=>Array.from(document.querySelectorAll('.apply-form-array-card__fixture')).map(r=>({text:Array.from(r.querySelectorAll('input:not([role]),textarea')).map(e=>e.value),choices:Array.from(r.querySelectorAll('.ud__select__selector__selectItem')).map(e=>e.textContent)})));
  const expected=[{text:['演示高中','理科','2019-09','2022-06'],choices:['高中','统招全日制']},{text:['演示大学','计算机','2022-09','2026-06'],choices:['本科','统招全日制']},{text:[],choices:['英语','熟练']},{text:[],choices:['日语','入门']}];
  expected.push(...[1,2].map(i=>({text:['https://example.com/work'+i,'演示作品'+i],choices:[]})),...[1,2].map(i=>({text:['演示奖项'+i,'202'+i,'演示获奖'+i],choices:[]})),...[1,2].map(i=>({text:['演示项目'+i,'开发'+i,'202'+i+'-01','202'+i+'-06','https://example.com/project'+i,'演示描述'+i],choices:[]})));
  assert.equal(await page.locator('main > .ud-formily-item .ud__select__selector__selectItem').textContent(),'青岛');
  assert.deepEqual(await snapshot(),expected);await fill();assert.deepEqual(await snapshot(),expected);
  assert.equal(await page.evaluate(()=>saves),0);assert.equal(await page.locator('.ud__select__dropdown:visible').count(),0);
  console.log('PASS Feishu controls: '+initial+' initial rows, native month ranges, UD choice commits, record isolation and idempotence');await page.close();
 }}finally{await browser.close();if(process.env.QIUZHAO_BENCHMARK_OUTPUT)fs.writeFileSync(process.env.QIUZHAO_BENCHMARK_OUTPUT,JSON.stringify({scope:'isolated-feishu-39-control-fixture',measurements},null,2)+'\n');}
})().catch(e=>{console.error(e);process.exitCode=1;});
