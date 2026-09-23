/* Diagnostic metadata only: no values, DOM, source documents, credentials or URL paths. */
(() => {
  const code=v=>/^[a-zA-Z][a-zA-Z0-9_-]{0,69}$/.test(String(v||''))?String(v):'unknown';
  const count=v=>Number.isFinite(v)?Math.max(0,Math.min(10000000,Math.floor(v))):0;
  const status=v=>['verified','failed','missing','manual'].includes(v)?v:'manual';
  function sanitize(raw,version){
    raw=raw||{};
    return {schema:2,id:/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(raw.runId||'')?raw.runId:crypto.randomUUID(),at:new Date().toISOString(),version:String(version),
      host:/^[a-zA-Z0-9.-]{1,253}$/.test(raw.host||'')?raw.host:'unknown',
      contentBuild:/^[0-9.]+-dev$/.test(raw.contentBuild||'')?raw.contentBuild:'unknown',
      startedAt:Number.isFinite(raw.startedAt)?raw.startedAt:null,durationMs:count(raw.durationMs),
      useAI:raw.useAI===true,overwrite:raw.overwrite===true,
      trigger:raw.trigger==='automatic'?'automatic':'manual',verification:['immediate','final','incomplete'].includes(raw.verification)?raw.verification:'incomplete',
      outcome:['running','finished','fill-cancelled','fill-timeout','fill-error','sensitive-page'].includes(raw.outcome)?raw.outcome:'unknown',
      droppedEvents:count(raw.droppedEvents),
      events:(Array.isArray(raw.events)?raw.events:[]).slice(0,600).map(e=>{
        const out={seq:count(e?.seq),ms:count(e?.ms),stage:code(e?.stage),control:count(e?.control),fieldKey:code(e?.fieldKey)};
        for(const key of ['reason','operation','action','tag','widget','route','direction'])if(e?.[key]!==undefined)out[key]=code(e[key]);
        for(const key of ['count','score','step','afterControl','matchedCount'])if(e?.[key]!==undefined)out[key]=count(e[key]);
        for(const key of ['ok','connected','hasValue','invalid','sourcePresent','matchesTarget','sameAsWritten','previousVerified','range','start'])if(typeof e?.[key]==='boolean')out[key]=e[key];
        return out;
      }),
      counts:{verified:count(raw.counts?.verified),nonempty:count(raw.counts?.nonempty),empty:count(raw.counts?.empty)},aiRequests:count(raw.aiRequests),
      items:(Array.isArray(raw.items)?raw.items:[]).slice(0,300).map(i=>({ordinal:count(i?.ordinal),control:count(i?.control),fieldKey:code(i?.fieldKey),status:status(i?.status),reason:code(i?.reason)})),
      diagnostics:(Array.isArray(raw.diagnostics)?raw.diagnostics:[]).slice(0,300).map(i=>({fieldKey:code(i?.fieldKey),record:count(i?.record),status:status(i?.status),reason:code(i?.reason)})),
      repeats:(Array.isArray(raw.repeats)?raw.repeats:[]).slice(0,30).map(i=>({group:code(i?.group),requested:count(i?.requested),before:count(i?.before),after:count(i?.after),reason:code(i?.reason)})),
      persistence:'not-tested'};
  }
  let queue=Promise.resolve();
  function save(raw){
    const entry=sanitize(raw,chrome.runtime.getManifest().version);
    const job=queue.then(async()=>{
      const stored=await chrome.storage.local.get('runLogs');
      const previous=Array.isArray(stored.runLogs)?stored.runLogs:[];
      await chrome.storage.local.set({runLogs:[entry,...previous.filter(log=>log.id!==entry.id)].slice(0,30)});
      return entry.id;
    });
    queue=job.catch(()=>{});return job;
  }
  globalThis.QIUZHAO_RUN_LOGS={sanitize,save};
})();
