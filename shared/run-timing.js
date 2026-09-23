/* Timing lives with the page task, so closing the toolbar popup does not reset it. */
(function(root) {
  const bucket=phase=>phase==='filling'?'filling':phase==='self-check'?'verification':'planning';
  function attach(run,now=()=>Date.now()) {
    let phase=run.phase,changedAt=run.startedAt,end=null;
    const totals={planning:0,filling:0,verification:0};
    Object.defineProperty(run,'phase',{enumerable:true,configurable:true,
      get:()=>phase,set:next=>{
        if(end!==null || next===phase)return;
        const at=now();totals[bucket(phase)]+=Math.max(0,at-changedAt);changedAt=at;phase=next;
      }});
    function snapshot() {
      const at=end===null?now():end,stageTimes={...totals};
      stageTimes[bucket(phase)]+=Math.max(0,at-changedAt);
      return {startedAt:run.startedAt,elapsedMs:Math.max(0,at-run.startedAt),stage:bucket(phase),stageTimes};
    }
    return {snapshot,finish(){if(end===null)end=now();return snapshot();}};
  }
  root.QIUZHAO_RUN_TIMING={attach};
  if(typeof module!=='undefined' && module.exports)module.exports=root.QIUZHAO_RUN_TIMING;
})(globalThis);
