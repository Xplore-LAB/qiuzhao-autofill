/* Local-only, value-free evidence collected from scanned application forms. */
(function(root){
  const STATUS=new Set(['verified','failed','missing','manual','empty','recheck']);
  const safeNumber=value=>Number.isFinite(value)&&value>=0?Math.floor(value):0;
  const safeKey=value=>/^[a-zA-Z0-9:_-]{1,100}$/.test(String(value||''))?String(value):'';
  const safeReason=value=>/^[a-zA-Z0-9:_-]{1,100}$/.test(String(value||''))?String(value):'';
  const copy=value=>value&&typeof value==='object'?JSON.parse(JSON.stringify(value)):{};
  function entryFor(registry,host,now){
    const all=copy(registry),previous=all[host]&&typeof all[host]==='object'?all[host]:{};
    const entry={firstSeenAt:safeNumber(previous.firstSeenAt)||now,lastSeenAt:now,scans:safeNumber(previous.scans),runs:safeNumber(previous.runs),fields:previous.fields&&typeof previous.fields==='object'?previous.fields:{},repeats:previous.repeats&&typeof previous.repeats==='object'?previous.repeats:{}};
    return {all,entry};
  }
  function trim(registry){
    return Object.fromEntries(Object.entries(registry).sort((a,b)=>(b[1]?.lastSeenAt||0)-(a[1]?.lastSeenAt||0)).slice(0,40));
  }
  function recordScan(registry,host,overview,now=Date.now()){
    if(!host)return copy(registry);const state=entryFor(registry,host,now),entry=state.entry;
    entry.scans++;
    entry.lastScan={totalControls:safeNumber(overview?.totalControls),emptyControls:safeNumber(overview?.emptyControls),ruleCandidates:safeNumber(overview?.ruleCandidates),aiCandidates:safeNumber(overview?.aiCandidates),repeatSections:(Array.isArray(overview?.repeatSections)?overview.repeatSections:[]).slice(0,12).map(item=>({group:safeKey(item.bulkKey)||safeKey(item.label),records:safeNumber(item.records),rows:safeNumber(item.rows),addable:item.addable===true}))};
    state.all[host]=entry;return trim(state.all);
  }
  function recordRun(registry,host,run,now=Date.now()){
    if(!host)return copy(registry);const state=entryFor(registry,host,now),entry=state.entry;
    entry.runs++;
    const fields=Array.isArray(run?.fields)?run.fields:[];
    for(const field of fields){
      const key=safeKey(field?.fieldKey),status=STATUS.has(field?.status)?field.status:'';
      if(!key||!status)continue;
      const stats=entry.fields[key]&&typeof entry.fields[key]==='object'?entry.fields[key]:{};
      stats[status]=safeNumber(stats[status])+1;stats.lastStatus=status;stats.lastSeenAt=now;entry.fields[key]=stats;
    }
    entry.fields=Object.fromEntries(Object.entries(entry.fields).sort((a,b)=>(b[1]?.lastSeenAt||0)-(a[1]?.lastSeenAt||0)).slice(0,120));
    for(const repeat of Array.isArray(run?.repeats)?run.repeats:[]){
      const key=safeKey(repeat?.group);if(!key)continue;
      entry.repeats[key]={requested:safeNumber(repeat.requested),before:safeNumber(repeat.before),after:safeNumber(repeat.after),added:Math.max(0,safeNumber(repeat.after)-safeNumber(repeat.before)),reason:safeReason(repeat.reason),lastSeenAt:now};
    }
    entry.lastRun={outcome:safeReason(run?.outcome)||'unknown',verified:safeNumber(run?.verified),pending:safeNumber(run?.pending),pageEmpty:safeNumber(run?.pageEmpty),at:now};
    state.all[host]=entry;return trim(state.all);
  }
  function list(registry){return Object.entries(registry&&typeof registry==='object'?registry:{}).sort((a,b)=>(b[1]?.lastSeenAt||0)-(a[1]?.lastSeenAt||0));}
  const api={recordScan,recordRun,list};root.QIUZHAO_SITE_OBSERVATIONS=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
