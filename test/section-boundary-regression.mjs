import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../content/content.js',import.meta.url),'utf8');
const add={id:'education_addButton'};
const section={contains:el=>[add,heading].includes(el),querySelectorAll:()=>[add]};
function heading(){}
heading.contains=()=>false; heading.parentElement=section;
const context={genericRepeatScope:()=>null,repeatAddControl:()=>add,document:{getElementById:()=>heading,body:{},documentElement:{}}};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function repeatSectionRoot('),source.indexOf('  function repeatMatchingControls('))+'\nthis.root=repeatSectionRoot;',context);
assert.equal(context.root({}),section);
context.document.getElementById=()=>section;
assert.equal(context.root({}),section);
console.log('section boundary passed: ID on heading resolves to common section; ID on wrapper remains supported');
