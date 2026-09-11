import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../content/content.js',import.meta.url),'utf8');
const implementation=source.slice(source.indexOf('  async function confirmChoiceSelection('),source.indexOf('  function fireEscape('));
async function run(selects=true, disabled=false) {
  let elapsed=0, committed=false, clicks=0;
  const option={matches:()=>selects&&elapsed>=500,querySelector:()=>null};
  const confirm={disabled,closest:()=>null};
  const layer={querySelector:()=>null};
  const context={checkFillRun:()=>{},customControlMatchesValue:()=>committed,ownedChoiceLayer:()=>layer,visibleChoiceLayers:()=>[layer],exactLayerButton:()=>confirm,valueCandidates:()=>['汉族'],bestVisibleOption:()=>({el:option}),choiceTextScore:()=>0,safeCustomClick:()=>{clicks++;committed=true;return true;},wait:async ms=>elapsed+=ms};
  vm.createContext(context);vm.runInContext(implementation+'\nthis.confirm=confirmChoiceSelection;',context);
  return {ok:await context.confirm({}, {}, '汉族'),clicks,elapsed};
}
const good=await run();assert.equal(good.ok,true);assert.equal(good.clicks,1);assert.ok(good.elapsed>=500);
const empty=await run(false);assert.equal(empty.ok,false);assert.equal(empty.clicks,0);
const disabled=await run(true,true);assert.equal(disabled.ok,false);assert.equal(disabled.clicks,0);
console.log('confirmation passed: wait for checked state, single confirm, final readback, no empty or disabled confirmation');
