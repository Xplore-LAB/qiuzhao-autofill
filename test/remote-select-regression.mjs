import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../content/content.js',import.meta.url),'utf8');
const implementation=source.slice(source.indexOf('  async function waitForChoiceOption('),source.indexOf('  function exactLayerButton(')) + source.slice(source.indexOf('  async function fillCustomSelect('),source.indexOf('  async function fillAreaSelector('));
async function run(available, searchable=true) {
  let elapsed=0,searching=false,selected=false,closed=0,clicks=0;
  const option={},search={},anchor={},layer={querySelector:()=>null,querySelectorAll:()=>[]};
  const context={OPTION_SELECTOR:'[role="option"]',choiceTextScore:()=>0,
    replayChoiceExperience:async()=>false,finishChoiceExperience:async()=>{},
    activeFillRun:null,
    choiceFailureReasons:new WeakMap(),
    dismissVisibleChoiceLayers:async()=>{closed++;return true;},
    safeCustomClick:el=>{if(el===option){selected=true;clicks++;}return true;},
    wait:async ms=>{elapsed+=ms;},
    visibleChoiceLayers:()=>selected?[]:[layer],ownedChoiceLayer:(_,layers)=>layers[0]||null,
    valueCandidates:(_,v)=>[v],bestVisibleOption:()=>available&&elapsed>=900?{el:option,text:'演示大学'}:null,
    customSearchInput:()=>searchable?search:null,setNativeValue:()=>{searching=true;return true;},
    normalize:x=>x,optionClickTarget:x=>x,isVisible:()=>!selected,exactLayerButton:()=>null,
    customControlMatchesValue:()=>selected,confirmChoiceSelection:async()=>selected
  };
  vm.createContext(context);vm.runInContext(implementation+'\nthis.fill=fillCustomSelect;',context);
  const ok=await context.fill(anchor,{},'演示大学');
  return {ok,clicks,closed,elapsed};
}
const delayed=await run(true);
assert.equal(delayed.ok,true);assert.equal(delayed.clicks,1);assert.ok(delayed.elapsed>=900);
const missing=await run(false);
assert.equal(missing.ok,false);assert.equal(missing.clicks,0);assert.ok(missing.closed>=2);assert.ok(missing.elapsed<=3300);
const noSearch=await run(true,false);
assert.equal(noSearch.ok,true);assert.equal(noSearch.clicks,1);
const noSearchMissing=await run(false,false);
assert.equal(noSearchMissing.ok,false);assert.equal(noSearchMissing.clicks,0);
console.log('remote select passed: delayed searchable/non-searchable menus, bounded timeout, no incorrect selection, cleanup');
