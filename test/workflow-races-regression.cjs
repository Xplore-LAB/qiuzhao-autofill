// Reproduce races against the real runtime functions, using fixed demo values only.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const contentBuild=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8')).version+'-dev';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

async function previewNavigation(){
  const source=fs.readFileSync(path.join(root,'content/content.js'),'utf8');
  const start=source.indexOf('  function previewControlState(el)'),end=source.indexOf('\n  function traceStep(',start);
  assert(start>=0&&end>start,'Preview function boundaries must be present');
  const control={value:'',label:'姓名'},profile={name:'固定演示姓名'};
  const context={
    chrome:{storage:{local:{get:async()=>({profile})}}},
    activeFillRun:null,lastFillPreview:null,crypto:{randomUUID:()=> 'demo-preview-token'},
    location:{href:'https://fixture.invalid/#/jobs/123'},
    hasVisiblePassword:()=>false,ensureDefaultProfileLoaded:async()=>{},
    collectControls:()=>[control],buildPageOverview:()=>({totalControls:1}),
    auditValue:element=>element.value,getTextCandidates:element=>[{text:element.label}],
  };
  vm.createContext(context);vm.runInContext(source.slice(start,end),context);
  const preview=await context.previewForm();
  assert.equal(await context.validFillPreview(preview.previewToken),true,'Unchanged job and controls must accept the current preview');
  context.location.href='https://fixture.invalid/#/jobs/456';
  assert.equal(await context.validFillPreview(preview.previewToken),false,'SPA navigation reusing all DOM controls must expire the prior job preview');
  const next=await context.previewForm();
  assert.equal(await context.validFillPreview(next.previewToken),true,'Re-previewing the new route must permit filling');
  context.location.href='https://fixture.invalid/apply?jobId=789';
  assert.equal(await context.validFillPreview(next.previewToken),false,'History API URL changes must also expire an earlier preview');
}

function panelFixture(){
  const elements=new Map(),oldReply=deferred(),requests=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{textContent:'',classList:{toggle(){}},replaceChildren(){}});
    return elements.get(id);
  };
  const context={
    URLSearchParams,Date,Promise,Error,setTimeout,clearTimeout,
    setInterval:()=>0,clearInterval(){},location:{search:''},
    window:{addEventListener(){}},
    document:{addEventListener(){},getElementById:element},
    chrome:{storage:{local:{get:async()=>({profile:{name:'固定演示姓名'},settings:{}})}},tabs:{
      query:async()=>[{id:12}],
      sendMessage:async(tabId,message,target)=>{
        requests.push({tabId,message,target});
        if(message.type==='PING')return {host:'fixture.invalid',contentBuild};
        if(message.type==='GET_FILL_STATUS'&&target.documentId==='doc-A')return oldReply.promise;
        if(message.type==='GET_FILL_STATUS')return {running:true,runId:'B-fresh'};
        throw Error('Unexpected fixture message: '+message.type);
      },
    }},
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'popup/quick.js'),'utf8'),context);
  vm.runInContext(`
    tabId=12;frameId=0;documentId='doc-A';
    frames=[{frameId:0,documentId:'doc-A'},{frameId:2,documentId:'doc-B'}];
    pageReady=true;ready=true;
  `,context);
  return {context,element,oldReply,requests};
}

async function staleFrameReply(rejectOld){
  const fixture=panelFixture(),{context,element,oldReply,requests}=fixture;
  const oldPoll=vm.runInContext('poll()',context);
  assert.equal(requests[0].target.documentId,'doc-A');
  await vm.runInContext('selectFrame(2)',context);
  assert.equal(vm.runInContext('documentId',context),'doc-B');
  // The selected document has its own state. Late replies must not replace it or its notice.
  vm.runInContext("accept({running:true,runId:'B-current'});message('B 区域正在运行');",context);
  if(rejectOld)oldReply.reject(Error('Demo A document disconnected'));
  else oldReply.resolve({running:true,runId:'A-late'});
  await oldPoll;
  assert.equal(vm.runInContext('status.runId',context),'B-current',`Old frame ${rejectOld?'error':'status'} must not overwrite the selected frame`);
  assert.equal(element('message').textContent,'B 区域正在运行',`Old frame ${rejectOld?'error':'status'} must not replace the new frame notice`);
  assert.equal(vm.runInContext('polling',context),false,'A discarded old response must release the polling lock');
  await vm.runInContext('poll()',context);
  assert.equal(requests.at(-1).target.documentId,'doc-B','The next poll must target the selected document');
  assert.equal(vm.runInContext('status.runId',context),'B-fresh','A fresh response from the selected document must still be accepted');
}

(async()=>{
  await previewNavigation();
  await staleFrameReply(false);
  await staleFrameReply(true);
  console.log('PASS workflow races: SPA/history navigation expires old previews; stale frame success/error ignored; selected document polling recovers');
})().catch(error=>{console.error(error);process.exitCode=1;});
