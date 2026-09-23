const assert=require('node:assert/strict');
const {createRouter}=require('../shared/frame-router.js');
(async()=>{
  let router,calls=[],sequence=0;
  router=createRouter({sendMessage:async(tabId,message)=>{
    calls.push({tabId,message});
    router.report({...message,frame:{totalControls:2,contentBuild:'demo',sensitive:false}},{tab:{id:tabId},frameId:0,documentId:'top',url:'https://example.com/form?private=omit'});
    router.report({...message,frame:{totalControls:4,contentBuild:'demo'}},{tab:{id:tabId},frameId:9,documentId:'child',url:'https://form.example.com/form'});
    assert.equal(router.report({...message,frame:{contentBuild:'demo'}},{tab:{id:999},frameId:3}),false);
  }},{timeout:10,id:()=>String(++sequence)});
  const [a,b]=await Promise.all([router.discover(7),router.discover(8)]);
  assert.equal(a.length,2);assert.deepEqual(a,b);
  assert.deepEqual(a.map(frame=>frame.frameId),[0,9]);
  assert.equal(a[1].documentId,'child');assert.equal(a[0].host,'example.com');
  assert(!JSON.stringify(a).includes('private'));
  assert.equal(router.report({requestId:'1',frame:{contentBuild:'late'}},{tab:{id:7},frameId:2}),false);
  assert(calls.every(call=>call.message.type==='PROBE_FORM_FRAMES'),'only read-only discovery is broadcast');
  await assert.rejects(router.discover(null));
  const empty=createRouter({sendMessage:async()=>{throw Error('no receiver');}},{timeout:20,id:()=> 'empty'});
  assert.deepEqual(await empty.discover(7),[]);
  console.log('PASS frame routing: multiple documents, concurrent requests, sender isolation, no URL leakage, no write broadcast, timeout cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
