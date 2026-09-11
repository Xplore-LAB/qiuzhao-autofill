import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/content.js', import.meta.url), 'utf8');
const implementation = source.slice(source.indexOf('  async function fillAreaSelector('), source.indexOf('  async function fillCustomRadio('));
async function run(value) {
  let depth = 0, selected = '', committed = '', closed = 0;
  const clicks = [], names = ['山东省','青岛市','市南区'];
  const rows = names.map((label, index) => ({
    get isConnected() { return depth === index; },
    querySelector(selector) {
      if (selector === '.area-text-label') return { textContent: label, action() { clicks.push('展开:' + label); depth++; } };
      if (selector === '.area-icon-right.visible') return index < 2 ? {} : null;
      return { action() { selected = names.slice(0, index + 1).join('/'); clicks.push('选中:' + label); } };
    }
  }));
  const layer = {
    querySelectorAll(selector) { return selector.includes('.area-item-container') ? [rows[depth]] : [{textContent:names[depth]}]; },
    querySelector() { return {textContent:selected}; }
  };
  const context = {
    isVisible: () => true,
    safeCustomClick: node => { if (!node) return false; node.action(); return true; },
    wait: async () => {},
    exactLayerButton: () => ({ action() { committed = selected; clicks.push('确定'); } }),
    customControlValueTexts: () => committed ? [committed] : [],
    dismissVisibleChoiceLayers: async () => {closed++;return true;}
  };
  vm.createContext(context);
  vm.runInContext(implementation + '\nthis.fillAreaSelector = fillAreaSelector;', context);
  const ok = await context.fillAreaSelector({}, layer, {key:'household'}, value);
  return {ok, committed, closed, clicks};
}
const complete = await run('山东省/青岛市/市南区');
assert.equal(complete.ok, true);
assert.equal(complete.committed, '山东省/青岛市/市南区');
assert.deepEqual(complete.clicks, ['展开:山东省','展开:青岛市','选中:市南区','确定']);
for (const value of ['山东省', '山东省青岛市不存在区']) {
  const result = await run(value);
  assert.equal(result.ok, false);
  assert.equal(result.committed, '');
  assert.equal(result.closed, 1);
}
console.log('area selector regression passed: full path, incomplete path, unavailable leaf, cleanup');
