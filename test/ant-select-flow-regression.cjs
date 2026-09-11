const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require(process.env.QIUZHAO_JSDOM||'jsdom');
const source=fs.readFileSync(path.join(__dirname,'../content/content.js'),'utf8');
const dom=new JSDOM('<title>招聘表单</title><div class="ant-form-item"><label>最高学历</label><div class="ant-select"><div class="ant-select-selector"><input role="combobox" aria-controls="degree-list" readonly style="opacity:0"></div></div></div>',{runScripts:'outside-only',url:'https://fixture.invalid/'}),w=dom.window;
let listener,opened=0;
w.CSS={escape:s=>s};w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLElement.prototype.getBoundingClientRect=function(){return {top:0,left:0,width:this.id==='degree-list'?0:this.isConnected?100:0,height:this.id==='degree-list'?0:this.isConnected?20:0};};
w.chrome={storage:{local:{get:async()=>({profile:{degree:'本科'},settings:{autoFill:false}}),set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){listener=fn;}},sendMessage:async()=>({})}};
const anchor=w.document.querySelector('.ant-select');
anchor.querySelector('.ant-select-selector').addEventListener('mousedown',()=>{
 if(w.document.querySelector('.ant-select-dropdown'))return;opened++;
 w.document.body.insertAdjacentHTML('beforeend','<div class="ant-select-dropdown"><div id="degree-list" role="listbox" style="height:0;width:0;overflow:hidden"><div role="option">bachelor</div></div><div class="ant-select-item-option"><div class="ant-select-item-option-content">本科</div></div></div>');
 w.document.querySelector('.ant-select-item-option-content').onclick=()=>{
  anchor.insertAdjacentHTML('beforeend','<span class="ant-select-selection-item">本科</span>');w.document.querySelector('.ant-select-dropdown').remove();
 };
});
(async()=>{try{
 w.eval(source);
 const result=await new Promise(resolve=>listener({type:'FILL_FORM',overwrite:true,useAI:false},null,resolve));
 assert.equal(opened,1);assert.equal(anchor.querySelector('.ant-select-selection-item')?.textContent,'本科',JSON.stringify(result));
 assert(result.filled.includes('学历/学位'),JSON.stringify(result));assert.equal(result.note,undefined);
 console.log('PASS full content flow: mousedown trigger, hidden ARIA listbox, visible option, final audit');
}finally{w.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
