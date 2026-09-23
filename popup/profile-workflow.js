/* Resume lifecycle UI. Shares the existing profile editor; all values render as text. */
const UPDATES=globalThis.QIUZHAO_PROFILE_UPDATES;
let savedProfile={}, pendingUpdate=null, saveQueue=Promise.resolve(), saveBlocked=false, sourceBusy=false;
const cloneProfile=value=>JSON.parse(JSON.stringify(value));
function workflowStatus(message, error=false) {
  $('#workflowStatus').textContent=message; $('#workflowStatus').classList.toggle('error',error);
}
function selectProfileTab(id) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===id));
  document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id==='tab-'+id));
  $('#main').scrollTop=0;
}
function renderProfileSummary() {
  const count=Object.values(profile).filter(v=>!UPDATES.empty(v)).length;
  $('#profileHeading').textContent=count?'资料已建立，可继续更新':'先建立你的资料';
  const missing=[['name','姓名'],['phone','手机'],['email','邮箱']].filter(([k])=>!profile[k]).map(([,v])=>v);
  $('#profileSummary').textContent=count?`已保存 ${count} 项资料。${missing.length?'常用信息待补充：'+missing.join('、')+'。':'姓名、手机、邮箱已填写，请在投递前核对。'}`:'选择 PDF 简历即可本地解析，核对后直接用于网申；也可手动填写。';
}
function refreshProfileEditor() {
  for(const tab of FIELD_TABS)$('#tab-'+tab.id).replaceChildren();
  $('#customList').replaceChildren();buildPanels();buildCustoms();renderProfileSummary();
}
function saveError(error) {
  $('#saveStatus').textContent=error.message||'保存失败，请重试';$('#saveStatus').classList.add('error');
}
function persistProfileEdits() {
  collect();const localNext=cloneProfile(profile), rules=cloneProfile(siteRules);
  const changedKeys=Object.keys(localNext).filter(k=>!UPDATES.equal(savedProfile[k],localNext[k]));
  $('#saveStatus').textContent='正在保存…';$('#saveStatus').classList.remove('error');
  const task=saveQueue.then(async()=>{
    if(saveBlocked)throw Error('资料在其他窗口有更新，请核对并发修改');
    const next={...savedProfile};for(const key of changedKeys)next[key]=localNext[key];
    const response=await chrome.runtime.sendMessage({type:'PROFILE_COMMIT',expected:savedProfile,next});
    if(!response?.ok){
      if(response?.conflict){saveBlocked=true;$('#reviewConflictsBtn').hidden=false;}
      throw Error(response?.error||(response?.conflict?'资料在其他窗口有更新，请核对并发修改':'保存服务没有响应，请重新加载扩展后重试'));
    }
    savedProfile=cloneProfile(response.profile);
    for(const key of Object.keys(response.profile))if(UPDATES.equal(profile[key],localNext[key])&&!UPDATES.equal(response.profile[key],localNext[key])){
      profile[key]=response.profile[key];
      if(key==='customs'){$('#customList').replaceChildren();buildCustoms();}
      const input=[...document.querySelectorAll('[data-key]')].find(el=>el.dataset.key===key);
      if(input){const value=typeof profile[key]==='string'?profile[key]:JSON.stringify(profile[key],null,2);if(input.tagName==='SELECT'&&value&&![...input.options].some(o=>o.value===value)){const op=document.createElement('option');op.value=value;op.textContent=value+'（原资料）';input.append(op);}input.value=value;input.dataset.originalText=value;}
    }
    await chrome.storage.local.set({siteRules:rules});
    flashSaved('已保存 ✓');renderProfileSummary();
  });
  saveQueue=task.catch(()=>{});return task;
}
function labelForProfileKey(key) {
  for(const tab of FIELD_TABS){
    let section=document.querySelector('.tab[data-tab="'+tab.id+'"]').textContent;
    for(const field of tab.fields){
      if(field.type==='divider')section=field.label;
      if(field.key===key)return section+' / '+field.label;
    }
  }
  return key==='customs'?'自定义字段':key;
}
function displayProfileValue(value) {
  if(Array.isArray(value))return value.map((item,index)=>'第 '+(index+1)+' 条\n'+displayProfileValue(item)).join('\n\n');
  if(value&&typeof value==='object')return Object.entries(value).map(([key,item])=>(key==='label'?'字段名':key==='value'?'内容':labelForProfileKey(key))+'：'+displayProfileValue(item)).join('\n');
  return value==null?'':String(value);
}
function normalizeIncoming(raw) {
  const incoming=UPDATES.validate(raw), fields=new Map(FIELD_TABS.flatMap(t=>t.fields).filter(f=>f.key).map(f=>[f.key,f]));
  for(const [key,value] of Object.entries(incoming)){
    if(key==='customs'){
      if(!Array.isArray(value)||value.some(c=>!c||typeof c.label!=='string'||typeof c.value!=='string'))throw Error('自定义字段格式不正确');
    }else if(!fields.has(key))throw Error('存在本版本不支持的资料字段：'+key+'，请核对备份版本');
    else if(fields.get(key).type==='records'){
      if(typeof value!=='string'&&!Array.isArray(value)&&!(value&&typeof value==='object'))throw Error('多条经历格式不正确：'+labelForProfileKey(key));
    }else if(typeof value!=='string')throw Error('资料字段应为文本：'+labelForProfileKey(key));
  }
  return incoming;
}
async function stageProfileUpdate(incoming,label,{skipSave=false,resolvingConflict=false,extraction=null,source=null}={}) {
  if(pendingUpdate)throw Error('请先应用或放弃下方待核对的更新，再导入另一份资料');
  if(!skipSave)await persistProfileEdits();
  const clean=normalizeIncoming(incoming);
  const stored=await chrome.storage.local.get('profile');
  const draft={schema:1,label:String(label).slice(0,100),base:cloneProfile(stored.profile||{}),incoming:clean,at:Date.now(),resolvingConflict};
  if (extraction) draft.extraction={warnings:extraction.warnings,evidence:extraction.evidence};
  await chrome.storage.local.set({pendingProfileUpdate:draft,...(source?{sourceMaterial:source}:{})});
  pendingUpdate=draft;renderProfileUpdate();selectProfileTab('resume');
  $('#updateReview').scrollIntoView?.({block:'start'});
}
function renderProfileUpdate() {
  const root=$('#updateRows');root.replaceChildren();$('#updateReview').hidden=!pendingUpdate;
  if(!pendingUpdate)return;
  const rows=UPDATES.diff(pendingUpdate.base,pendingUpdate.incoming);
  $('#updateTitle').textContent=pendingUpdate.label+' · '+rows.length+' 项变化';
  $('#updateHint').textContent='新增内容默认勾选；替换和清空需逐项勾选。未提及的资料保留，多条经历按整组更新。应用前自动保留一份恢复记录。';
  if (pendingUpdate.extraction?.warnings?.length) $('#updateHint').textContent+=' '+pendingUpdate.extraction.warnings.join(' ');
  for(const row of rows){
    const card=document.createElement('label');card.className='update-row';
    const check=document.createElement('input');check.type='checkbox';check.dataset.updateKey=row.key;check.checked=row.selected;
    const title=document.createElement('strong');title.textContent=labelForProfileKey(row.key)+' · '+({add:'新增',change:'替换',clear:'清空'}[row.kind]);
    const before=document.createElement('pre');before.textContent='当前：'+(displayProfileValue(row.before)||'（空）');
    const after=document.createElement('pre');after.textContent='更新：'+(displayProfileValue(row.after)||'（空）');
    card.append(check,title,before,after);
    if (pendingUpdate.extraction?.evidence?.[row.key]) {
      const origin=document.createElement('pre');origin.textContent='原文依据：'+pendingUpdate.extraction.evidence[row.key];card.append(origin);
    }
    root.append(card);
  }
  $('#applyUpdateBtn').disabled=!rows.some(r=>r.selected);
  root.onchange=()=>{$('#applyUpdateBtn').disabled=!root.querySelector('input:checked');};
}
async function applyProfileUpdate() {
  const button=$('#applyUpdateBtn');button.disabled=true;
  try{
    await saveQueue;
    const draft=pendingUpdate;if(!draft)return;
    if(saveBlocked&&!draft.resolvingConflict)throw Error('本页还有未保存的修改。请先放弃本次更新，再点击“核对并发修改”，避免丢失手动输入。');
    const selected=[...$('#updateRows').querySelectorAll('input:checked')].map(e=>e.dataset.updateKey);
    if(!selected.length)return;
    const next=UPDATES.apply(draft.base,UPDATES.diff(draft.base,draft.incoming),selected);
    const result=await chrome.runtime.sendMessage({type:'PROFILE_COMMIT',expected:draft.base,next,checkpoint:true,label:draft.label,clearDraft:true});
    if(!result?.ok){
      if(result?.conflict){
        const latest=await chrome.storage.local.get('profile');draft.base=cloneProfile(latest.profile||{});
        await chrome.storage.local.set({pendingProfileUpdate:draft});renderProfileUpdate();
        throw Error('资料在预览后发生变化，已刷新对比，请重新选择');
      }
      throw Error(result?.error||'更新未保存，请重试');
    }
    profile=result.profile;savedProfile=cloneProfile(profile);pendingUpdate=null;saveBlocked=false;
    $('#reviewConflictsBtn').hidden=true;$('#saveStatus').classList.remove('error');
    refreshProfileEditor();renderProfileUpdate();workflowStatus('已应用 '+selected.length+' 项变化。网页上已填的内容需另行核对。');flashSaved('已保存 ✓');
  }catch(error){workflowStatus(error.message,true);}
  finally{button.disabled=!$('#updateRows input:checked');}
}
async function initProfileWorkflow(store) {
  savedProfile=cloneProfile(profile);pendingUpdate=store.pendingProfileUpdate||null;
  const manager=new URLSearchParams(location.search).get('manage')==='1';
  document.body.classList.toggle('manager',manager);$('.manager-note').hidden=!manager;$('#openManagerBtn').hidden=manager;
  $('#editProfileBtn').onclick=()=>selectProfileTab('basic');
  $('#configureAiBtn').onclick=()=>selectProfileTab('ai');
  $('#openManagerBtn').onclick=async()=>{try{await persistProfileEdits();await chrome.tabs.create({url:chrome.runtime.getURL('popup/popup.html?manage=1')});}catch(e){saveError(e);}};
  $('#saveNowBtn').onclick=()=>persistProfileEdits().catch(saveError);
  $('#applyUpdateBtn').onclick=applyProfileUpdate;
  $('#cancelUpdateBtn').onclick=async()=>{try{await chrome.storage.local.set({pendingProfileUpdate:null});pendingUpdate=null;renderProfileUpdate();workflowStatus('已放弃本次更新，已保存资料保持原状。');}catch(e){workflowStatus('操作未保存，请重试',true);}};
  $('#recoverProfileBtn').onclick=async()=>{try{
    await persistProfileEdits();const {profileRecovery}=await chrome.storage.local.get('profileRecovery');
    if(!profileRecovery){workflowStatus('尚无批量更新恢复记录。');return;}
    const incoming={...Object.fromEntries(Object.keys(profile).map(k=>[k,k==='customs'?[]:''])),...profileRecovery.profile};
    await stageProfileUpdate(incoming,'恢复至 '+new Date(profileRecovery.at).toLocaleString(),{skipSave:true});
  }catch(e){workflowStatus(e.message,true);}};
  $('#reviewConflictsBtn').onclick=async()=>{try{
    collect();const incoming=Object.fromEntries(Object.keys(profile).filter(k=>!UPDATES.equal(profile[k],savedProfile[k])).map(k=>[k,profile[k]]));
    await stageProfileUpdate(incoming,'核对本页未保存的修改',{skipSave:true,resolvingConflict:true});
  }catch(e){workflowStatus(e.message,true);}};
  renderProfileSummary();
  $('#saveStatus').textContent='资料保存在当前浏览器';
  try{renderProfileUpdate();}catch{pendingUpdate=null;workflowStatus('待核对更新格式异常，请重新导入文件。',true);}
  if(manager && new URLSearchParams(location.search).get('view')==='logs')await showRunLogs();
}
