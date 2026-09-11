import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/content.js', import.meta.url), 'utf8');
const implementation = source.slice(source.indexOf('  function fillMultiSelect('), source.indexOf('  function fillRadio('));
let events = 0;
const context = {
  valueCandidates: (_, value) => [value],
  choiceTextScore: (label, values) => values.includes(label) ? 10 : 0,
  fireEvents: () => events++, wait: async () => {},
};
vm.createContext(context);
vm.runInContext(implementation + '\nthis.fill = fillMultiSelect; this.verify = verifyControlWrite;', context);
const option = (text, selected = false, disabled = false) => ({textContent:text, value:text, selected, disabled});
const sel = {tagName:'SELECT', multiple:true, isConnected:true, options:[option('北京'),option('上海'),option('广州',true)], getAttribute:()=>null};
assert.equal(context.fill(sel, {}, ['北京、上海']), true);
assert.deepEqual(sel.options.map(o=>o.selected), [true,true,false]);
assert.equal(context.fill(sel, {}, ['北京','上海']), true);
assert.deepEqual(sel.options.map(o=>o.selected), [true,true,false]);
assert.equal(context.fill(sel, {}, ['北京','不存在']), false);
assert.deepEqual(sel.options.map(o=>o.selected), [true,true,false]);
sel.options[1].disabled = true;
assert.equal(context.fill(sel, {}, ['上海']), false);
sel.options[1].disabled = false;
sel.options.push(option('北京'));
assert.equal(context.fill(sel, {}, ['北京']), false);
sel.options.pop();
assert.equal(await context.verify(sel, ['北京','上海']), '');
assert.equal(await context.verify(sel, ['广州']), 'value-reverted');
const input = {tagName:'INPUT', isConnected:true, value:'短', getAttribute:()=>null};
assert.equal(await context.verify(input, '完整内容'), 'value-reverted');
input.validity = {valid:false};
assert.equal(await context.verify(input, '短'), 'validation-rejected');
input.isConnected = false;
assert.equal(await context.verify(input, '短'), 'control-replaced');
assert.equal(events, 2);
console.log('native controls: multi-selection, idempotence, missing/disabled/ambiguous options, rollback, truncation, validity and replacement passed');
