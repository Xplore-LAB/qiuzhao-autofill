// Minimal Ant panel state machine: only actual panel/button actions change dates.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../content/content.js'),'utf8');
const helper=source.slice(source.indexOf('  async function waitForControlState('),source.indexOf('  async function waitForVisibleQuery('));
const code=source.slice(source.indexOf('  async function fillAntCalendar('),source.indexOf('  async function fillPhoenixDayPicker('));
function fixture({year=2026,month=9,mode='date',disabled='',readonly=true,stalled=false,headers=true}={}){
 const input={value:'',readOnly:readonly},events=[];let decade=Math.floor(year/10)*10;
 const node=(cls,title,action,blocked=false)=>({title,textContent:title,className:cls,disabled:false,isConnected:true,
  classList:{contains:c=>cls.split(' ').includes(c)},getAttribute:n=>n==='aria-disabled'&&blocked?'true':null,
  matches:s=>s.split(',').some(c=>cls.split(' ').includes(c.trim().slice(1))),
  closest:()=>null,querySelector:s=>s==='.ant-picker-cell-inner'?null:null,querySelectorAll:()=>[],click:()=>{events.push(title||cls);if(!stalled)action?.();}});
 const cell=(title,action)=>node('ant-picker-cell ant-picker-cell-in-view'+(title===disabled?' ant-picker-cell-disabled':''),title,action,title===disabled);
 const cells=()=>mode==='year'?Array.from({length:10},(_,i)=>cell(String(decade+i),()=>{year=decade+i;mode='month';})):
  mode==='month'?Array.from({length:12},(_,i)=>cell(year+'-'+String(i+1).padStart(2,'0'),()=>{month=i+1;if(monthOnly)input.value=year+'-'+String(month).padStart(2,'0');else mode='date';})):
  Array.from({length:new Date(year,month,0).getDate()},(_,i)=>cell(year+'-'+String(month).padStart(2,'0')+'-'+String(i+1).padStart(2,'0'),()=>{input.value=year+'-'+String(month).padStart(2,'0')+'-'+String(i+1).padStart(2,'0');}));
 const monthOnly=mode==='month';
 function buttons(selector){
  if(headers&&selector==='.ant-picker-year-btn'&&mode!=='year')return [node('ant-picker-year-btn',String(year),()=>{decade=Math.floor(year/10)*10;mode='year';})];
  if(headers&&selector==='.ant-picker-month-btn'&&mode==='date')return [node('ant-picker-month-btn',String(month),()=>{mode='month';})];
  if(/header-(super-)?(prev|next)-btn/.test(selector)){
   const superStep=selector.includes('super-'),direction=selector.includes('prev')?-1:1;
   return [node(selector.slice(1),'',()=>{if(mode==='year')decade+=direction*10;else if(mode==='month'||superStep)year+=direction;else{month+=direction;if(month===0){year--;month=12;}if(month===13){year++;month=1;}}})];
  }
  return [];
 }
 const panel={isConnected:true,className:'ant-picker-panel',classList:{contains:()=>false},getAttribute:()=>null,querySelectorAll(s){
  if(s==='.ant-picker-panel')return [panel];
  if(s.includes('ant-picker-cell'))return cells().filter(c=>!s.includes('in-view')||c.classList.contains('ant-picker-cell-in-view'));
  if(s==='.ant-picker-'+mode+'-panel')return [node(s.slice(1),'')];
  return buttons(s);
 },querySelector(s){return this.querySelectorAll(s)[0]||null;}};
 const anchor={querySelectorAll:s=>s==='input'?[input]:[],querySelector:s=>s==='input'?input:null,closest:()=>null,matches:()=>false,classList:{contains:()=>false},getAttribute:()=>null};
 const ctx={checkFillRun:()=>{},Date,Number,String,Array,Math,pad2:n=>String(n).padStart(2,'0'),isVisible:n=>!!n?.isConnected,wait:async()=>{},safeCustomClick:n=>{if(!n)return false;n.click();return true;}};
 vm.createContext(ctx);vm.runInContext(helper+code+';this.fill=fillAntCalendar;',ctx);
 return {fill:(y,m,d)=>ctx.fill(anchor,panel,['',String(y),String(m),d==null?undefined:String(d)]),events,input};
}
(async()=>{
 const far=fixture();assert.equal(await far.fill(2000,2,29),true);assert.equal(far.input.value,'2000-02-29');assert.ok(far.events.length<=8,'distant birthday should use year/month panels, not 26 individual year steps; actions='+far.events.length);assert.equal(far.input.readOnly,true);
 const near=fixture();assert.equal(await near.fill(2026,8,15),true);assert.ok(near.events.length<=3);
 const month=fixture({mode:'month'});assert.equal(await month.fill(2000,2),true);assert.equal(month.input.value,'2000-02');assert.ok(month.events.length<=7);
 const legacy=fixture({headers:false});assert.equal(await legacy.fill(2026,8,15),true);assert.equal(legacy.events.length,2);
 const blocked=fixture({disabled:'2000-02-29'});assert.equal(await blocked.fill(2000,2,29),false);assert.equal(blocked.input.value,'');assert.ok(!blocked.events.includes('2000-02-29'));
 const blockedYear=fixture({disabled:'2000'});assert.equal(await blockedYear.fill(2000,2,29),false);assert.equal(blockedYear.input.value,'');assert.ok(!blockedYear.events.includes('2000'));
 const invalid=fixture();assert.equal(await invalid.fill(2025,2,29),false);assert.equal(invalid.events.length,0);
 const stuck=fixture({stalled:true});assert.equal(await stuck.fill(2000,2,29),false);assert.ok(stuck.events.length<=1,'stalled panel must fail promptly');
 console.log('PASS Ant date jump ('+far.events.length+' actions for 2026-09 → 2000-02-29): distant leap day, same-year month, month-only picker, legacy arrows, disabled day/year, invalid date, read-only input and stalled UI');
})().catch(error=>{console.error(error);process.exitCode=1;});
