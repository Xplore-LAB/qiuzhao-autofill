import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../content/content.js',import.meta.url),'utf8');
const context={OPTION_SELECTOR:'known',isVisible:el=>!el.hidden,normalize:s=>s,choiceTextScore:(s,c)=>c.includes(s)?1000:0};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function bestVisibleOption('),source.indexOf('  async function waitForChoiceOption('))+'\nthis.best=bestVisibleOption;this.target=optionClickTarget;',context);
function option(text,children=[]) {return {textContent:text,contains:el=>children.includes(el),getAttribute:()=>null,querySelector:()=>null,querySelectorAll:()=>children};}
const checkbox=option(''),row=option('汉族',[checkbox]),other=option('藏族');
const layer={querySelectorAll:selector=>selector==='known'?[]:[row,other]};
assert.equal(context.best(layer,['汉族'],false,new Set()).el,row);
assert.equal(context.target(row),checkbox);
checkbox.hidden=true;assert.equal(context.target(row),row);
checkbox.hidden=false;checkbox.disabled=true;assert.equal(context.target(row),row);
layer.querySelectorAll=()=>[row,option('汉族')];
assert.equal(context.best(layer,['汉族'],false,new Set()),null);
row.disabled=true;layer.querySelectorAll=()=>[row];
assert.equal(context.best(layer,['汉族'],false,new Set()),null);
console.log('option target passed: scoped legacy labels, child target, hidden/disabled children, ambiguous rows, disabled row');
