(() => {
 const cases=[['搜索、民族、三级地区','controls.html?case=happy'],['选项不存在，保持空白','controls.html?case=missing-option'],['选中后回退，不算成功','controls.html?case=rollback'],['六类重复经历、逐字段与幂等','../repeat-records-harness.html'],['综合日期与控件','../v1.4-harness.html'],['异步选中与延迟回写','../choice-verification-harness.html']];
 const frame=document.querySelector('iframe'),status=document.querySelector('#status'),run=document.querySelector('#run'),download=document.querySelector('#download');let report;
 run.onclick=async()=>{
  run.disabled=true;download.disabled=true;document.querySelector('#rows').replaceChildren();report={at:new Date().toISOString(),engine:navigator.userAgent,cases:[]};
  try{
   for(const [id,url] of cases){
    status.textContent='正在运行：'+id;const start=Date.now();
    frame.src=url+(url.includes('?')?'&':'?')+'run='+start;
    let result;
    while(Date.now()-start<65000){
     await new Promise(r=>setTimeout(r,150));
     const w=frame.contentWindow;if(!w||!w.location.href.includes('run='+start))continue;
     const detail=w.__hisenseReport,text=w.document.querySelector('#result,#testStatus,output')?.textContent||'';
     if(detail||/^(通过|测试通过|PASS|控件回归通过：true|失败|测试失败|FAIL|控件回归通过：false)/.test(text)){
      result={...detail,id,pass:detail?detail.pass:/^(通过|测试通过|PASS|控件回归通过：true)/.test(text),message:text,checks:detail?.checks||w.__REPEAT_RESULT?.checks||[],ms:Date.now()-start};break;
     }
    }
    result ||= {id,pass:false,error:'场景超时',ms:Date.now()-start};report.cases.push(result);
    const row=document.createElement('tr');for(const value of [id,result.pass?'通过':'失败',(result.ms/1000).toFixed(1)+' 秒']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}document.querySelector('#rows').append(row);
   }
   report.pass=report.cases.every(c=>c.pass);status.textContent=`完成：${report.cases.filter(c=>c.pass).length}/${cases.length} 场景通过`;download.disabled=false;
  }catch(error){status.textContent='运行异常：'+error;}finally{run.disabled=false;}
 };
 download.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hisense-browser-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
})();
