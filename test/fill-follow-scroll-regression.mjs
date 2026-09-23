import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../content/content.js', import.meta.url), 'utf8');
const start = source.indexOf('  function followCurrentField(');
const end = source.indexOf('  async function executeFillPlan(');
assert.ok(start >= 0 && end > start, 'fill-follow helpers must exist before the fill loop');

let now = 1000;
const calls = [];
const target = {
  isConnected: true,
  getBoundingClientRect: () => ({top: 900, bottom: 960}),
  scrollIntoView: options => calls.push(options),
};
const field = {isConnected:true, closest: () => target};
const context = {
  Date: {now: () => now},
  activeFillRun: {followPausedUntil: 0},
  window: {innerHeight: 800},
  document: {documentElement:{clientHeight:800}, addEventListener: () => {}},
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nthis.follow=followCurrentField;this.pause=pauseFillFollow;', context);

context.follow(field);
assert.equal(JSON.stringify(calls), JSON.stringify([{block:'center', inline:'nearest', behavior:'smooth'}]), 'off-screen field should be brought into view');

target.getBoundingClientRect = () => ({top:180, bottom:260});
now += 500;
context.follow(field);
assert.equal(calls.length, 1, 'already visible fields must not cause page movement');

target.getBoundingClientRect = () => ({top:-80, bottom:-20});
context.pause();
now += 100;
context.follow(field);
assert.equal(calls.length, 1, 'manual browsing must pause follow scrolling');
now += 1501;
context.follow(field);
assert.equal(calls.length, 2, 'follow scrolling should resume after the pause');

assert.match(source, /followCurrentField\(task\.el\);/, 'fill loop must follow the field before writing it');
console.log('fill follow scroll passed: off-screen follow, visible no-op, manual pause, automatic resume');
