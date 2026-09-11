/* Local profile review and serialized writes. No network or generated code. */
(() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  function validate(value) {
    if (!object(value) || JSON.stringify(value).length > 1000000) throw Error('资料格式不正确或超过 1MB');
    function visit(v, depth=0) {
      if (depth > 8) throw Error('资料结构过深');
      if (v && typeof v === 'object') for (const key of Object.keys(v)) {
        if (['__proto__','constructor','prototype'].includes(key)) throw Error('资料包含不支持的字段');
        visit(v[key], depth+1);
      }
    }
    visit(value); return copy(value);
  }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
    return value == null ? '' : value;
  }
  const equal = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  const empty = v => v == null || v === '' || (Array.isArray(v) && !v.length);
  function diff(base, incoming) {
    validate(base); validate(incoming);
    return Object.keys(incoming).filter(key=>!equal(base[key],incoming[key])).map(key=>({
      key, before:base[key] ?? '', after:incoming[key],
      kind:empty(incoming[key])?'clear':empty(base[key])?'add':'change',
      selected:empty(base[key]) && !empty(incoming[key]),
    }));
  }
  function apply(base, rows, selected) {
    const next=validate(base);
    for (const row of rows) if (selected.includes(row.key)) next[row.key]=copy(row.after);
    return next;
  }
  function createWriter(storage) {
    let queue=Promise.resolve();
    return args => {
      const task=queue.then(async()=>{
        const expected=validate(args.expected), next=validate(args.next);
        const stored=await storage.get(['profile']);
        const current=validate(stored.profile || {});
        const keys=[...new Set([...Object.keys(expected),...Object.keys(next)])].filter(k=>!equal(expected[k],next[k]));
        if(keys.some(k=>!equal(current[k],expected[k]))) return {ok:false,conflict:true};
        const merged=copy(current);
        for(const key of keys) { if(Object.hasOwn(next,key))merged[key]=next[key];else delete merged[key]; }
        const at=Date.now(), update={profile:merged,profileUpdatedAt:at};
        if(args.checkpoint && keys.length) update.profileRecovery={profile:current,at,label:String(args.label||'资料更新').slice(0,80)};
        if(args.clearDraft) update.pendingProfileUpdate=null;
        await storage.set(update);
        return {ok:true,profile:merged,at};
      });
      queue=task.catch(()=>{}); return task;
    };
  }
  const api={validate,diff,apply,equal,empty,createWriter};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else globalThis.QIUZHAO_PROFILE_UPDATES=api;
})();
