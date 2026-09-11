const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom'),U=require('../shared/profile-updates');
const root=path.join(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x));
const html=fs.readFileSync(path.join(root,'popup/popup.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const pause=()=>new Promise(r=>setTimeout(r,25));
async function open(data){
 const dom=new JSDOM(html,{url:'https://fixture.invalid/popup.html?manage=1',runScripts:'outside-only'}),w=dom.window;
 const storage={get:async keys=>Object.fromEntries((typeof keys==='string'?[keys]:keys).map(k=>[k,data[k]===undefined?undefined:clone(data[k])])),set:async values=>Object.assign(data,clone(values)),remove:async key=>delete data[key]};
 const writer=U.createWriter(storage);
 w.chrome={storage:{local:storage},runtime:{getURL:p=>'chrome-extension://fixture/'+p,sendMessage:async m=>m.type==='PROFILE_COMMIT'?writer(m):{ok:true}},tabs:{query:async()=>[],create:async()=>{}}};
 w.eval(['shared/providers.js','shared/profile-updates.js','popup/popup.js','popup/profile-workflow.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n')); 
 await pause();return {w,dom};
}
(async()=>{
 const data={profile:{name:'演示原名',phone:'13800000000',gender:'自定义原值',internshipsBulk:[{internshipCompany:'示例'}]},settings:{aiEnabled:false},learned:{},siteRules:{}};
 let {w,dom}=await open(data);
 try{
  assert(w.document.body.classList.contains('manager'));
  assert.equal(w.document.querySelector('[data-key="gender"]').value,'自定义原值');
  const name=w.document.querySelector('[data-key="name"]');name.value='手动修改';name.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();
  assert.equal(data.profile.name,'手动修改');assert(Array.isArray(data.profile.internshipsBulk),'unmodified structured records keep their type');
  name.value='Test ';name.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();
  assert.equal(name.value,'Test ','autosave must not remove spaces while typing');
  name.value='手动修改';name.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();
  await w.stageProfileUpdate({name:'<img src=x onerror=alert(1)>',phone:'',email:'demo@example.com'},'更新测试');
  assert.equal(data.profile.name,'手动修改');assert.equal(w.document.querySelectorAll('#updateRows img').length,0);
  assert.equal(w.document.querySelectorAll('#updateRows input:checked').length,1);
  dom.window.close();({w,dom}=await open(data));assert.equal(w.document.querySelectorAll('#updateRows input').length,3,'review survives popup closing');
  await w.applyProfileUpdate();assert.equal(data.profile.name,'手动修改');assert.equal(data.profile.phone,'13800000000');assert.equal(data.profile.email,'demo@example.com');assert(data.profileRecovery);
  await w.stageProfileUpdate({name:'提取的新姓名'},'冲突测试');
  const check=w.document.querySelector('#updateRows input');check.checked=true;
  data.profile.name='其他窗口修改';await w.applyProfileUpdate();assert.equal(data.profile.name,'其他窗口修改');assert(w.document.querySelector('#workflowStatus').textContent.includes('发生变化'));
  assert.equal(w.document.querySelectorAll('#updateRows input:checked').length,0);
  await w.document.querySelector('#cancelUpdateBtn').onclick();
  dom.window.close();({w,dom}=await open(data));
  // Demo stays a preview and must not silently enable overwrite or AI.
  await w.loadDemoProfile();assert.equal(data.settings.overwrite,undefined);assert.equal(data.settings.aiEnabled,false);
  assert.equal(data.pendingProfileUpdate.label,'演示资料');
  assert.equal(data.profile.name,'其他窗口修改');
  await w.document.querySelector('#cancelUpdateBtn').onclick();
  // An unrelated save must retain the other window's change and refresh the editor.
  data.profile.email='another@example.com';
  const phone=w.document.querySelector('[data-key="phone"]');phone.value='13900000000';phone.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();
  assert.equal(data.profile.email,'another@example.com');
  assert.equal(w.document.querySelector('[data-key="email"]').value,'another@example.com');
  phone.value='13700000000';phone.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();assert.equal(data.profile.email,'another@example.com');
  // A stale edit while a file preview is open cannot be discarded by applying it.
  await w.stageProfileUpdate({email:'updated@example.com'},'等待核对');
  data.profile.phone='外部号码';phone.value='本页号码';phone.dispatchEvent(new w.Event('input',{bubbles:true}));await pause();
  assert.equal(w.document.querySelector('#reviewConflictsBtn').hidden,false);
  w.document.querySelector('#updateRows input').checked=true;await w.applyProfileUpdate();
  assert.equal(data.profile.email,'another@example.com');assert.equal(phone.value,'本页号码');
  await w.document.querySelector('#cancelUpdateBtn').onclick();
  await w.document.querySelector('#reviewConflictsBtn').onclick();
  assert.equal(data.pendingProfileUpdate.resolvingConflict,true);
  w.document.querySelector('#updateRows input').checked=true;await w.applyProfileUpdate();
  assert.equal(data.profile.phone,'本页号码');assert.equal(data.pendingProfileUpdate,null);
  // File parsing is local; the explicit AI action stages the result.
  const send=w.chrome.runtime.sendMessage;let extractionCalls=0;
  w.chrome.runtime.sendMessage=async message=>{
   if(message.type==='AI_EXTRACT_PROFILE'){extractionCalls++;return {ok:true,profile:{name:'文件新姓名'}};}
   return send(message);
  };
  await w.importSourceMaterial({target:{files:[{name:'resume.txt',size:50,text:async()=> '姓名：文件新姓名'}],value:'resume.txt'}});
  assert.equal(extractionCalls,0);assert.equal(data.profile.name,'其他窗口修改');
  await w.extractSourceWithAi();assert.equal(extractionCalls,1);assert.equal(data.pendingProfileUpdate.incoming.name,'文件新姓名');
  assert.equal(data.profile.name,'其他窗口修改');
  await w.document.querySelector('#cancelUpdateBtn').onclick();
  await assert.rejects(w.readSourceFile({name:'resume.pdf',size:50}),/暂不支持/);
  const settingsBefore=clone(data.settings);
  await w.importData({target:{files:[{size:200,text:async()=>JSON.stringify({app:'qiuzhao-autofill',profile:{name:'备份姓名'},settings:{aiEnabled:true}})}],value:'backup.json'}});
  assert.equal(data.pendingProfileUpdate.incoming.name,'备份姓名');assert.deepEqual(data.settings,settingsBefore);
  console.log('PASS profile workflow: immediate editing, structured/select round trip, safe review, persistent draft, chosen merge, recovery, stale preview, Demo safety');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
