const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(require('node:path').join(__dirname,'../content/content.js'),'utf8');
const dom=new JSDOM('<div class="ant-picker"><input value="2026-06-01"></div><div class="ant-select"><div class="ant-select-selector"><input value="搜索词"></div></div>',{runScripts:'outside-only'}),w=dom.window;
w.eval('function isVisible(){return true;}function isRadio(){return false;}function isCustomRadioGroup(){return false;}'+source.slice(source.indexOf('  function customControlValueTexts('),source.indexOf('  function customControlValueText('))+'window.read=customControlValueTexts;');
assert.deepEqual(Array.from(w.read(w.document.querySelector('.ant-picker'))),['2026-06-01']);
assert.equal(w.read(w.document.querySelector('.ant-select')).length,0);
console.log('PASS editable date retained; uncommitted search text excluded');
dom.window.close();
