'use strict';
const $=id=>document.getElementById(id);
const stageNames={planning:'分析与规划',filling:'填写',verification:'核验'};
let tabId=null,settings={},ready=false,pageReady=false,starting=false,polling=false,status=null,receivedAt=0;
let profileRead=0;
let frameId=null,documentId=null,frames=[],frameRead=0,preview=null,jobSource='manual';
let pendingSignature='';
const pendingReasons={
  'repeat-section-unobserved':'区块未识别：可能未展开或当前页面不提供',
  'empty-after-fill':'填写后回读仍为空，未计为成功',
  'target-mismatch':'最终值与资料目标不符',
  'choice-layer-close-blocked':'下拉列表未能收起，请手动核对',
  'existing-unverified':'保留已有内容，请确认', 'unmapped-or-empty':'未找到可靠对应，或仍为空',
  'missing-source':'资料中缺少内容', 'validation-rejected':'网页校验未通过', 'value-reverted':'填写后内容被回退',
  'control-replaced':'页面控件发生变化', 'not-verified':'未确认填写成功',
  'record-identity-missing':'缺少用于匹配经历的学校名称', 'source-record-ambiguous':'资料中有难以区分的记录',
  'existing-record-ambiguous':'已有记录无法唯一匹配', 'partial-record-unresolved':'已有半填记录，请先确认归属',
  'new-record-required':'还需新增记录，自动添加未完成', 'record-container-unresolved':'未能确定经历区块',
  'record-field-ambiguous':'同一经历内有多个候选字段', 'record-field-missing':'未找到该记录的字段',
  'work-profile-mapping-required':'请确认工作经历与资料的对应关系'
};
function renderPending(){
  const items=status.pendingItems||[],signature=JSON.stringify([status.runId,items]);
  const list=$('pending-list');list.hidden=!items.length;
  if(signature===pendingSignature)return;pendingSignature=signature;list.replaceChildren();
  for(const item of items){
    const row=document.createElement('div'),button=document.createElement('button'),reason=document.createElement('span');
    button.className='text';button.textContent=item.label;button.disabled=!item.id;
    button.onclick=async()=>{try{const result=await rpc('LOCATE_SELF_CHECK',{id:item.id});if(!result?.ok)throw Error();message('已定位到网页中的对应字段。');}catch{message('字段已变化，请刷新页面状态后查看。',true);}};
    reason.textContent=pendingReasons[item.reason]||'尚未核验，请查看日志';row.append(button,reason);list.append(row);
  }
  if(status.summary?.pending>items.length){const more=document.createElement('p');more.textContent='这里只展示前 '+items.length+' 项，其余请查看结果与日志。';list.append(more);}
}
function seconds(ms){return (Math.max(0,ms)/1000).toFixed(1)+'秒';}
function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
async function rpc(type,extra={},timeout=3000,target=null){
  // Persistent panels must never write to an inactive page after a tab switch.
  if(type==='FILL_FORM'||type==='LOCATE_SELF_CHECK'){
    const [active]=await chrome.tabs.query({active:true,currentWindow:true});
    if(active?.id!==tabId)throw Error('请回到此侧栏对应的招聘网页');
  }
  return new Promise((resolve,reject)=>{
    const destination=target || (documentId?{documentId}:{frameId});
    if(!target && frameId===null){reject(Error('请先选择表单区域'));return;}
    const timer=setTimeout(()=>reject(Error('页面响应超时')),timeout);
    chrome.tabs.sendMessage(tabId,{type,...extra},destination).then(result=>{clearTimeout(timer);resolve(result);},error=>{clearTimeout(timer);reject(error);});
  });
}
function buttons(){
  const busy=starting||status?.running;
  $('start').disabled=!ready||busy;$('start').textContent=preview?'确认填写并自检':'识别并检查表单';$('stop').hidden=!busy;
  $('refresh-page').disabled=!!busy;$('frame-select').disabled=!!busy;
}
function clearPreview(){preview=null;$('preview').hidden=true;buttons();}
async function refreshProfile(){
  const read=++profileRead;
  const store=await chrome.storage.local.get(['profile','settings']);
  if(read!==profileRead)return;
  settings=store.settings||{};
  const profile=store.profile||{},hasBasics=[profile.name,profile.phone,profile.email].some(value=>typeof value==='string'&&value.trim());
  const count=value=>{if(Array.isArray(value))return value.length;if(typeof value==='string'){try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed.length:0;}catch{return 0;}}return 0;};
  const parts=[['教育',profile.educationBulk],['实习',profile.internshipsBulk],['项目',profile.projectsBulk],['奖励',profile.awardsBulk]].map(([label,value])=>[label,count(value)]).filter(([,n])=>n).map(([label,n])=>label+' '+n+' 条');
  $('profile').textContent=hasBasics?'资料已就绪'+(parts.length?' · '+parts.join(' / '):''):'尚未建立资料，请先打开管理页';
  $('mode').textContent=settings.aiEnabled?'AI 规划已启用':'本地规则模式 · 可在管理页配置 AI';
  ready=pageReady&&hasBasics;buttons();
}
function storageChanged(changes,area){
  if(area==='local'&&(changes.profile||changes.settings)){
    clearPreview();
    ready=false;buttons();
    refreshProfile().catch(()=>message('资料读取失败，请重新打开侧栏。',true));
  }
}
function render(){
  buttons();if(!status?.timing)return;
  $('progress').hidden=false;
  // Interpolate only fresh running samples; connection loss never invents progress.
  const age=Math.max(0,Date.now()-receivedAt),extra=status.running&&age<3000?age:0;
  $('elapsed').textContent=seconds(status.timing.elapsedMs+extra);
  for(const stage of Object.keys(stageNames)){
    const ms=status.timing.stageTimes[stage]||0,current=status.running&&status.timing.stage===stage;
    $('time-'+stage).textContent=ms>0||current?seconds(ms+(current?extra:0)):'—';
    const row=document.querySelector('[data-stage="'+stage+'"]');row.classList.toggle('active',current);row.classList.toggle('done',!current&&ms>0);
  }
  const outcome=status.outcome||'unknown',running=!!status.running;
  const partial=outcome==='finished'&&status.summary?.pending>0;
  $('progress').dataset.state=running?(status.cancelled?'stopping':'running'):partial?'partial':outcome;
  $('state-label').textContent=running?(status.cancelled?'正在停止':'任务进行中'):'本轮结果';
  $('phase').textContent=running?(status.cancelled?'正在保留已填内容':stageNames[status.timing.stage]):partial?'部分完成，仍需核对':outcome==='finished'?'本轮流程已结束':outcome==='fill-cancelled'?'本轮已停止':'本轮未完成';
  const bar=$('bar');
  const meta=$('progress-meta');
  if(running&&status.timing.stage==='filling'&&status.total>0){bar.max=status.total;bar.value=Math.min(status.completed||0,status.total);meta.textContent='已处理 '+(status.completed||0)+' / '+status.total+' 个操作';}
  else if(running){bar.removeAttribute('value');meta.textContent=status.cancelled?'等待当前操作安全结束':'当前阶段正在处理';}
  else {bar.max=1;bar.value=outcome==='finished'?1:0;meta.textContent=outcome==='finished'?'本轮流程已结束':'本轮流程未完整结束';}
  $('field').textContent=running?(age>=3000?'正在等待页面状态更新，请勿重复点击。':status.timing.stage==='filling'?(status.field?'正在填写「'+status.field+'」':'正在写入页面字段'):(status.timing.stage==='verification'?'正在回读页面，确认填写结果':'正在识别页面字段和经历区块')):(outcome==='finished'?'填写结果已留在当前网页，请确认后自行保存或提交。':'已填内容会保留在网页中，建议先核对再决定是否重试。');
  const result=$('result-card');result.hidden=running;
  if(!running){
    const summary=status.summary||{};
    const ended=outcome==='finished',stopped=outcome==='fill-cancelled';
    $('result-badge').textContent=partial?'待核对':ended?'流程结束':stopped?'已停止':'需核对';
    $('result-title').textContent=partial?summary.pending+' 项待核对':ended?'当前可见字段核验结束':stopped?'已按请求停止':'页面连接或执行中断';
    $('result-note').textContent=partial?'点击下方字段可定位。流程结束不代表整份简历已填好。':ended?'仅核验当前页面；未验证网站是否持久保存，请自行确认。':stopped?'已填内容不会回退。建议核对当前网页后，再决定是否继续。':'结果可能不完整，请先查看网页和日志，避免重复新增记录。';
    $('verified-count').textContent=Number.isFinite(summary.verified)?summary.verified:'—';
    $('pending-count').textContent=Number.isFinite(summary.pending)?summary.pending:'—';
    renderPending();
  }
}
function accept(next){status=next;receivedAt=Date.now();render();if(next.running)message(next.cancelled?'正在停止，已填内容保留。':'');else if(next.summary)message('');}
async function poll(){
  if(polling||tabId===null||frameId===null||!pageReady)return;polling=true;
  const generation=frameRead;
  try{const next=await rpc('GET_FILL_STATUS');if(generation!==frameRead)return;if(next?.running||next?.timing){accept(next);}
    else if(status?.running){status={...status,running:false,outcome:'unknown'};message('任务状态已失效，请查看结果与日志，不要直接重复填写。',true);render();}}
  catch{if(generation===frameRead&&(status?.running||starting))message('连接暂不可用，停止状态尚未确认。可回到网页核对。',true);}
  finally{polling=false;}
}
async function openManager(view=''){
  const url=chrome.runtime.getURL('popup/popup.html?manage=1'+(view?'&view='+view:''));
  try{await chrome.tabs.create({url});window.close();}catch{message('管理页未能打开，请重试。',true);}
}
async function selectFrame(id){
  const read=++frameRead;
  frameId=id;documentId=frames.find(frame=>frame.frameId===id)?.documentId||null;
  pageReady=false;ready=false;status=null;$('progress').hidden=true;clearPreview();
  if(id===null){$('site').textContent='请选择要填写的表单区域';return;}
  try{
    const ping=await rpc('PING');if(read!==frameRead)return;
    if(ping?.contentBuild!=='1.16.1-dev')throw Error('请刷新招聘网页以加载新版插件，再重新识别。');
    $('site').textContent=(ping.host||'当前网页')+(id?' · 嵌入区域 '+id:'');
    pageReady=true;await refreshProfile();await poll();
  }catch(error){if(read!==frameRead)return;message(error.message||'页面连接失效，请重新识别。',true);}
}
async function discoverPage(){
  if(starting||status?.running)return;
  pageReady=false;ready=false;clearPreview();message('正在识别页面中的表单区域…');
  try{
    const result=await chrome.runtime.sendMessage({type:'DISCOVER_FORM_FRAMES',tabId});
    if(!result?.ok || !Array.isArray(result.frames))throw Error('无法连接页面，请刷新招聘网页后重试。');
    const previous=frames.find(frame=>frame.frameId===frameId);
    frames=result.frames.filter(frame=>!frame.sensitive && frame.totalControls>0);
    const select=$('frame-select');select.replaceChildren();
    const blank=document.createElement('option');blank.value='';blank.textContent='请选择表单区域';select.append(blank);
    for(const frame of frames){
      const option=document.createElement('option');option.value=String(frame.frameId);
      option.textContent=(frame.frameId?'嵌入区域 '+frame.frameId:'主页面')+' · '+frame.host+' · '+frame.totalControls+' 个控件';select.append(option);
    }
    $('frame-row').hidden=frames.length<2;
    const retained=previous?.documentId && frames.find(frame=>frame.documentId===previous.documentId);
    const chosen=frames.length===1?frames[0]:retained;
    select.value=chosen?String(chosen.frameId):'';
    await selectFrame(chosen?.frameId??null);
    if(!frames.length){$('site').textContent='未发现可填写的表单';message('可先收藏岗位。进入申请表单后点击“重新识别页面”；登录和受限页面不执行填写。');}
    else if(!chosen)message('发现多个表单区域，请先选择本次要填写的区域。');
    else if(pageReady)message('先检查页面，再确认填写。');
  }catch(error){message(error.message,true);}
}
async function prepare(){
  const result=await rpc('PREVIEW_FORM',{},15000);
  if(!result?.previewToken || !result.totalControls){
    const reason=result?.note==='sensitive-page'?'当前是登录或敏感页面，请先进入网申表单。':result?.note==='fill-running'?'网页已有填写任务，请等待结束。':'未能生成页面检查，请刷新网页后重新识别。';
    throw Error(reason);
  }
  preview=result;$('preview').hidden=false;
  $('preview-counts').textContent='识别到 '+result.totalControls+' 个控件，已有内容 '+result.filledControls+' 项，本地规则候选 '+result.ruleCandidates+' 项，其余空白 '+result.aiCandidates+' 项。';
  $('preview-labels').textContent=result.ruleLabels?.length?'候选字段：'+result.ruleLabels.join('、'):'尚无可靠的本地规则候选，请先核对资料。';
  const repeats=$('preview-repeats');repeats.replaceChildren();
  for(const item of result.repeatSections||[]){
    if(!item.records)continue;
    const row=document.createElement('p');row.textContent=item.label+'：资料 '+item.records+' 条，当前页面 '+item.rows+' 组'+(item.addable?'；可尝试添加经历':'；未找到添加入口');repeats.append(row);
  }
  message(settings.aiEnabled?'AI 已启用；确认后会按当前配置辅助填写，请核对上方范围。':'检查完成。确认后只填空白，并在结束时核验。');
}
async function captureJob(){
  $('capture-job').disabled=true;$('job-message').textContent='正在读取岗位信息…';
  try{
    const result=await rpc('GET_JOB_CONTEXT',{},5000,{frameId:0});
    if(!result?.ok)throw Error(result?.error||'当前页面无法读取，可在投递记录中手动添加。');
    if(result.job.ambiguous)throw Error(result.job.note);
    const job=result.job;
    for(const key of ['title','company','location','deadline','url','description'])$('job-'+key).value=job[key]||'';
    jobSource=job.source||'page';$('job-form').hidden=false;$('job-message').textContent=job.note;
  }catch(error){$('job-form').hidden=true;$('job-message').textContent=error.message;}
  finally{$('capture-job').disabled=false;}
}
async function saveJob(event){
  event.preventDefault();$('save-job').disabled=true;
  try{
    const application={source:jobSource};
    for(const key of ['title','company','location','deadline','url','description'])application[key]=$('job-'+key).value;
    const result=await chrome.runtime.sendMessage({type:'APPLICATION_SAVE',application});
    if(!result?.ok)throw Error(result?.error||'收藏失败，请重试。');
    $('job-message').textContent='已保存在投递记录中；尚未标记为已投递。';
  }catch(error){$('job-message').textContent=error.message;}
  finally{$('save-job').disabled=false;}
}
async function start(){
  if(!ready||starting||status?.running)return;starting=true;status=null;$('progress').hidden=true;buttons();message('正在建立填写任务…');
  try{
    const live=await rpc('GET_FILL_STATUS');if(live?.running){accept(live);return;}
    await refreshProfile();
    if(!ready){message('请先在管理页保存姓名、手机号或邮箱，再开始填写。',true);return;}
    if(!preview){await prepare();return;}
    // The page owns the task. Reopening this popup reconnects through status polling.
    const result=await rpc('FILL_FORM',{overwrite:false,useAI:!!settings.aiEnabled,selfCheck:true,previewToken:preview.previewToken},200000);
    clearPreview();
    if(result?.note==='preview-expired'){message('页面或资料发生变化，请重新检查后再填写。',true);return;}
    await poll();
    if(!status?.timing)message(result?.note?'本轮未完成，请查看日志。':'本轮结束，请查看详细结果。',!!result?.note);
  }catch(error){message(error.message==='请回到此侧栏对应的招聘网页'?error.message:'未能完成当前操作：'+error.message+'。请先核对网页状态，避免重复新增。',true);await poll();}
  finally{starting=false;buttons();}
}
async function stop(){
  $('stop').disabled=true;message('正在请求停止，已填内容保留。');
  try{const result=await rpc('STOP_FILL');if(!result?.ok)throw Error();await poll();}
  catch{message('未能确认停止。请回到网页核对，必要时刷新网页终止任务。',true);}
  finally{$('stop').disabled=false;}
}
async function init(){
  $('version').textContent='版本 '+(chrome.runtime.getManifest?.().version||'1.16.1')+' · 待实页验收';
  $('manage').onclick=()=>openManager();$('details').onclick=()=>openManager('logs');$('start').onclick=start;$('stop').onclick=stop;
  $('refresh-page').onclick=discoverPage;
  $('frame-select').onchange=()=>selectFrame($('frame-select').value===''?null:Number($('frame-select').value));
  $('capture-job').onclick=captureJob;$('job-form').onsubmit=saveJob;
  $('applications').onclick=()=>chrome.tabs.create({url:chrome.runtime.getURL('popup/applications.html')}).catch(()=>message('投递记录未能打开，请重试。',true));
  try{
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    const boundTab=new URLSearchParams(location.search).get('tabId');
    tabId=boundTab!==null&&/^\d+$/.test(boundTab)?Number(boundTab):tab?.id??null;
    const defaultSync=await chrome.runtime.sendMessage({type:'LOAD_DEFAULT_PROFILE'});
    if(!defaultSync?.ok){$('site').textContent='默认资料文件不可用';$('profile').textContent='检查 content/个人资料.json';message(defaultSync?.error||'请检查资料文件并重新加载扩展。',true);return;}
    await refreshProfile();
    if(tabId===null)throw Error();
    chrome.storage.onChanged?.addListener(storageChanged);
    await discoverPage();buttons();
  }catch{$('site').textContent='当前页面不可填写';message('请打开招聘简历页面，再点击插件。',true);}
}
document.addEventListener('DOMContentLoaded',init);
const pollTimer=setInterval(poll,800),clockTimer=setInterval(render,250);
window.addEventListener('pagehide',()=>{clearInterval(pollTimer);clearInterval(clockTimer);chrome.storage.onChanged?.removeListener(storageChanged);});
