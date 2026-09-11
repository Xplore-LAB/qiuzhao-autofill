// Minimal event-contract reproduction; real-site verification is recorded separately.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
const dom=new JSDOM('<div class="ant-picker ant-picker-range"><div class="ant-picker-input"><input></div><div class="ant-picker-input"><input></div></div><div id="layer" hidden></div>',{runScripts:'outside-only'});
const w=dom.window,range=w.document.querySelector('.ant-picker-range'),anchors=[...range.querySelectorAll('.ant-picker-input')],layer=w.document.querySelector('#layer');
let pressed=false,clicks=0,closed=0;
range.addEventListener('mousedown',()=>{pressed=true;});
range.addEventListener('click',()=>{clicks++;if(pressed)layer.hidden=false;pressed=false;});
w.checkFillRun=()=>{};w.isVisible=e=>e.isConnected&&!e.hidden;w.visibleChoiceLayers=()=>layer.hidden?[]:[layer];w.ownedChoiceLayer=(a,ls)=>ls[0]||null;
w.dismissVisibleChoiceLayers=async()=>{closed++;layer.hidden=true;return true;};w.wait=async()=>{};w.traceStep=()=>{};
w.fillAntCalendar=async(anchor,l,m)=>{anchor.querySelector('input').value=m[1]+'-'+m[2].padStart(2,'0')+'-01';return true;};
// Load production click helpers and date orchestration, not a rewritten implementation.
w.eval('let ignoreLearningUntil=0,programmaticFill=false;'+source.slice(source.indexOf('  function safeCustomClick('),source.indexOf('  function fireEnter('))+source.slice(source.indexOf('  const openDateRanges'),source.indexOf('  async function fillAntCalendar('))+'window.fill=fillCustomDate;');
(async()=>{try{
 assert.equal(await w.fill(anchors[0],'2022-09'),true,'range must receive mousedown before click');
 assert.equal(layer.hidden,false,'start selection must keep the range transaction open');
 const prior=closed;assert.equal(await w.fill(anchors[1],'2026-06'),true);
 assert.equal(closed,prior+1,'close only after end selection');
 assert.equal(clicks,2);assert.equal(layer.hidden,true);
 console.log('PASS Ant range: mouse activation, start/end transaction, cleanup');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
