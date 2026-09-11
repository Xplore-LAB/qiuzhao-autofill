import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../popup/popup.js',import.meta.url),'utf8');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';}
  append(...children){this.children.push(...children);}
  replaceChildren(){this.children=[];}
}
const root=new Element('div');
const context={$:()=>root,document:{createElement:tag=>new Element(tag)}};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function showResult('),source.indexOf('let fillSession ='))+'\nthis.show=showResult;',context);
context.show('已填；未完成：民族；AI 请求超时',false,{filled:['姓名'],failed:['民族'],pageFilledCount:73,pageEmptyCount:56});
assert.equal(root.className,'result partial');
assert.equal(root.children[1].children.length,3);
const details=root.children.find(e=>e.tag==='details');
assert.ok(details);assert.equal(details.open,undefined);assert.equal(details.children[1].children.length,3);
context.show('简短提示',false);assert.equal(root.children.length,1);
console.log('result panel passed: compact metrics, partial status, collapsed diagnostics, short message replacement');
