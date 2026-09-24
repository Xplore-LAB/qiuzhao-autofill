const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
function extract(start,end,context){vm.createContext(context);vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),context);return context;}
let visibility=0;
const node=(text,visible=true)=>({textContent:text,visible,closest(){return this;}});
const hidden=node('添加教育经历',false),add=node('添加教育经历');
const nodes=[...Array.from({length:500},()=>node('其他内容')),hidden,add];
const addCtx=extract('  function repeatAddControl(', '  function genericRepeatScope(',{
 document:{querySelectorAll:()=>nodes},normalize:s=>s.trim(),zhuanzhuanAdapter:()=>null,
 isVisible:n=>{visibility++;return n.visible;},genericRepeatScope:()=>null
});
assert.equal(addCtx.repeatAddControl({label:'教育经历'}),add,'hidden duplicate is never selected');
console.log('Add visibility checks:',visibility);
assert.equal(visibility,2,'unrelated nodes must not trigger layout/visibility work');
add.visible=false;assert.equal(addCtx.repeatAddControl({label:'教育经历'}),null,'visibility changes remain live');

let reads=0;
const inside={inside:true,text:'学校',compareDocumentPosition:()=>4},outside={inside:false,text:'学校'};
const controls=[outside,inside];
const ctx=extract('  function repeatMatchingControls(', '  function repeatPrimaryField(',{
 repeatSectionRoot:()=>({contains:el=>el.inside}),collectControls:()=>controls,
 getTextCandidates:el=>{reads++;return [{text:el.text}];},
 matchScore:(_f,texts)=>texts[0]?.text==='学校'?10:0,STRICT_MATCH_SCORE:8,
 Node:{DOCUMENT_POSITION_FOLLOWING:4}
});
assert.deepEqual(Array.from(ctx.repeatMatchingControls({}, {key:'educationSchool',patterns:[]})),[inside]);
console.log('Scoped label reads:',reads);assert.equal(reads,1,'never read labels outside the target record section');
inside.text='邮箱';assert.equal(ctx.repeatMatchingControls({}, {key:'educationSchool',patterns:[]}).length,0,'do not reuse stale labels');
inside.inside=false;outside.inside=true;assert.equal(ctx.repeatMatchingControls({}, {key:'educationSchool',patterns:[]})[0],outside,'re-evaluate moved controls');
reads=0;assert.equal(ctx.repeatMatchingControls({}, {key:'educationSchool',patterns:[]},controls,new Map([[outside,[{text:'学校'}]]]))[0],outside);assert.equal(reads,0,'use supplied scan labels');
console.log('PASS repeat scanning: bounded work, hidden additions, fresh labels, moving boundaries and supplied scan reuse');
