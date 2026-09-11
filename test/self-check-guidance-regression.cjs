const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../popup/popup.js'),'utf8');
const dom=new JSDOM('<div id="selfCheckResult"></div>',{runScripts:'outside-only'}),w=dom.window;
let exported;
w.$=s=>w.document.querySelector(s);w.FIELD_TABS=[{fields:[{key:'school'}]}];
w.Blob=class{constructor(parts){exported=JSON.parse(parts.join(''));}};
w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
w.eval(source.slice(source.indexOf('function renderSelfCheck('),source.indexOf('async function fillCurrentTab(')));
const rows=[...Array(38).fill(['verified','stable-match']),...Array(28).fill(['manual','unmapped-or-empty']),...Array(3).fill(['manual','existing-unverified']),['failed','no-matching-options'],['failed','no-visible-options'],['failed','ambiguous-options'],['failed','no-visible-options']];
try{
 const report={counts:{verified:38,manual:31,failed:4,missing:0},items:rows.map(([status,reason],i)=>({id:'field-'+(i+1),label:'演示字段',status,reason,fieldKey:i===0?'school':'PRIVATE-KEY',value:'PRIVATE-VALUE'}))};
 w.renderSelfCheck(report,42);
 const text=w.document.body.textContent;
 assert(text.includes('空白待判断 28'),'unresolved blanks must have their own visible count');
 assert(text.includes('已有内容待核对 3'),'existing values must not be described as missing data');
 assert(text.includes('填写失败 4'));assert(!text.includes('需人工'));
 assert(text.includes('尚不能确定是否缺资料'));assert(text.includes('没有可匹配的选项'));
 const empty=w.document.querySelector('[data-category="empty"]');assert(empty.open);assert.equal(empty.querySelectorAll('li').length,28);
 [...w.document.querySelectorAll('button')].find(b=>b.textContent==='导出脱敏诊断').click();
 assert.equal(exported.actionCounts.empty,28);assert.equal(exported.actionCounts.existing,3);
 assert.equal(exported.items[0].fieldKey,'school');assert.equal(exported.items[1].fieldKey,'unmapped');
 assert(!JSON.stringify(exported).includes('PRIVATE'));assert(!JSON.stringify(exported).includes('演示字段'));
 assert.equal(exported.items.filter(i=>i.category==='missing').length,0);
 console.log('PASS self-check guidance: 38/4/0/31 split, visible reasons, conservative blanks, safe export');
}finally{dom.window.close();}
