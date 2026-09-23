import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../content/content.js', import.meta.url), 'utf8');
class Element {
  constructor(key='', children=[]) {this.key=key;this.children=children;for(const child of children) child.parentElement=this;}
  contains(el) {return this===el || this.children.some(child=>child.contains(el));}
}
const names=[new Element('name'),new Element('name'),new Element('name')];
const dates=[new Element('date'),new Element('date')];
const rows=[new Element('',[names[0],dates[0]]),new Element('',[names[1]]),new Element('',[names[2],dates[1]])];
const section=new Element('',rows);
const writes=[];
const context={zhuanzhuanBindings:()=>null,activeFillRun:null,repeatSectionRoot:()=>section,repeatMatchingControls:(_,field)=>field.key==='name'?names:dates,applyControl:async(el,_,value)=>writes.push({el,value})};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('  function repeatRowRoots('),source.indexOf('  function aiControlKind('))+'\nthis.fill=fillRepeatedGroup;this.roots=repeatRowRoots;',context);
const group={primaryKey:'name',fieldKeys:['name','date']};
const fields={name:{key:'name',label:'名称'},date:{key:'date',label:'日期'}};
const used=new Set(),summary={failed:[]};
await context.fill(group,[{name:'甲',date:'2021'},{name:'乙',date:'2022'},{name:'丙',date:'2023'}],[],new Map(),used,fields,true,summary,{});
assert.equal(writes.find(w=>w.el===dates[0]).value,'2021');
assert.equal(writes.find(w=>w.el===dates[1]).value,'2023');
assert.equal(summary.diagnostics[0].record,2);
assert.equal(summary.diagnostics[0].reason,'record-field-missing');
assert.equal(used.size,5);
writes.length=0;
await context.fill(group,[{name:'甲'},{name:'乙'},{name:'丙',date:'2023'}],[],new Map(),new Set(),fields,true,{failed:[]},{});
assert.equal(writes.some(w=>w.el===dates[0]),false);
assert.equal(writes.find(w=>w.el===dates[1]).value,'2023');
assert.ok(context.roots(null,names).every(row=>row===null));
console.log('record binding passed: missing middle control, missing source, row isolation, reservation, unresolved section');
const unknown=new Element('unknown');unknown.parentElement=rows[1];unknown.isConnected=true;rows[1].children.push(unknown);
Object.assign(context,{activeFillRun:{useAI:true},bestLabelTextFrom:()=> '完成于',aiControlKind:()=> 'date',aiOptionTexts:()=>[],checkFillRun:()=>{},boundedRequest:async p=>p});
let mappings=[{controlId:'0',fieldKey:'1:date',confidence:.99,value:'编造时间'}];
context.chrome={runtime:{sendMessage:async()=>({ok:true,mappings})}};
context.diagnosticAiRequest=async message=>context.chrome.runtime.sendMessage(message);
writes.length=0;
await context.fill(group,[{name:'甲',date:'2021'},{name:'乙',date:'2022'},{name:'丙',date:'2023'}],[...names,...dates,unknown],new Map(),new Set(),fields,true,{failed:[]},{});
assert.equal(writes.find(w=>w.el===unknown).value,'2022');assert(context.activeFillRun.repeatControls.has(unknown));
mappings=[{controlId:'0',fieldKey:'0:date',confidence:.99}];writes.length=0;
await context.fill(group,[{name:'甲',date:'2021'},{name:'乙',date:'2022'},{name:'丙',date:'2023'}],[...names,...dates,unknown],new Map(),new Set(),fields,true,{failed:[]},{});
assert.equal(writes.some(w=>w.el===unknown),false);
console.log('record AI passed: local source values only, same-record mapping, cross-record rejection and global reservation');
