const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
let response={ok:false,errorCode:'authentication-error',error:'SECRET_KEY'};
const context={Date,FIELDS:[],activeFillRun:{startedAt:Date.now()},preflightAiEvents:[],persistRunCheckpoint:async()=>true,boundedRequest:async p=>p,chrome:{runtime:{sendMessage:async()=>{if(response instanceof Error)throw response;return response;}}}};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('  function traceStep('),source.indexOf('  async function persistRunCheckpoint(')),context);
(async()=>{
 await context.diagnosticAiRequest({type:'AI_ROUTE_RECORDS'},100);
 assert.equal(context.activeFillRun.events.at(-1).reason,'authentication-error');
 response={ok:true,routes:[{}]};await context.diagnosticAiRequest({type:'AI_ROUTE_RECORDS'},100);assert.equal(context.activeFillRun.events.at(-1).count,1);
 response=Error('SECRET_KEY timeout');await assert.rejects(context.diagnosticAiRequest({type:'AI_MATCH_FIELDS'},100));assert.equal(context.activeFillRun.events.at(-1).reason,'timeout');
 assert(!JSON.stringify(context.activeFillRun.events).includes('SECRET_KEY'));
 for(let i=0;i<700;i++)context.traceStep('task-start',null,null);
 assert.equal(context.activeFillRun.events.length,600);assert(context.activeFillRun.droppedEvents>0);
 console.log('PASS AI trace: request/result pairing, categorized rejection, timeout, no raw errors, bounded events');
})().catch(e=>{console.error(e);process.exitCode=1;});
