const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require(process.env.QIUZHAO_JSDOM || 'jsdom');
const source = fs.readFileSync(require('node:path').join(__dirname, '../content/content.js'), 'utf8');
const dom = new JSDOM('<div id="anchor"><input></div><div id="layer"><input placeholder="搜索"><div class="area-data-container"><div class="area-item-container"><span class="icon-container"><svg></svg></span><span class="area-text-label">市南区</span></div></div><div class="select-data-container"></div><button>确定</button></div>', {runScripts:'outside-only'});
const w = dom.window;
const cut = (a,b) => source.slice(source.indexOf(a), source.indexOf(b));
w.eval('let programmaticFill=false,ignoreLearningUntil=0;function checkFillRun(){} function isVisible(){return true;} async function wait(){} async function dismissVisibleChoiceLayers(){return true;} function exactLayerButton(layer){return layer.querySelector("button");} function customControlValueTexts(anchor){return [anchor.dataset.value||""];}'+
  cut('  function safeCustomClick(', '  function fireEnter(')+
  cut('  function customSearchInput(', '  const choiceFailureReasons')+
  cut('  async function fillAreaSelector(', '  async function fillCustomRadio(')+
  '\nwindow.testSearch=customSearchInput;window.testArea=fillAreaSelector;');
const anchor=w.document.querySelector('#anchor'), layer=w.document.querySelector('#layer');
assert.equal(w.testSearch(anchor,layer), layer.querySelector('input'), 'search must prefer popup input over anchor input');
layer.querySelector('input').disabled=true;
assert.equal(w.testSearch(anchor,layer),anchor.querySelector('input'),'editable anchor remains a fallback');
let selected=0;
layer.querySelector('svg').addEventListener('click',()=>{selected++;layer.querySelector('.select-data-container').textContent='市南区';});
layer.querySelector('button').addEventListener('click',()=>{if(selected)anchor.dataset.value='市南区';});
(async()=>{
  assert.equal(await w.testArea(anchor,layer,{key:'household'},'市南区'),true);
  assert.equal(selected,1,'area selection must reach inner SVG handler');
  dom.window.close();
  console.log('search/area DOM regression passed: popup input priority, fallback, SVG leaf and confirm readback');
})().catch(error=>{console.error(error);process.exitCode=1;});
