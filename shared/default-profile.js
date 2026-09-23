/* Local default file only. No AI or page access. */
(function(root) {
  const recordKeys=new Set(['educationBulk','internshipsBulk','projectsBulk','awardsBulk','researchBulk','languagesBulk']);
  function decode(text,keys,validate) {
    if(typeof text!=='string' || text.length>1000000)throw Error('default-file-size');
    const data=JSON.parse(text.replace(/^\uFEFF/,''));
    if(!data || Array.isArray(data) || typeof data!=='object' || !Object.hasOwn(data,'profile') || (data.app && data.app!=='qiuzhao-autofill'))throw Error('default-file-envelope');
    if(data.kind==='structured-profile' && data.schemaVersion!==1)throw Error('default-file-version');
    const profile=validate(data.profile);
    if(!Object.keys(profile).length)throw Error('default-file-empty');
    for(const [key,value] of Object.entries(profile)) {
      if(key==='customs') {
        if(!Array.isArray(value) || value.some(c=>!c || typeof c.label!=='string' || typeof c.value!=='string' || Object.keys(c).some(k=>!['label','value'].includes(k))))throw Error('default-file-customs');
      } else if(!keys.has(key))throw Error('default-file-unknown-field');
      else if(recordKeys.has(key)) {
        if(!Array.isArray(value) || value.some(r=>!r || Array.isArray(r) || typeof r!=='object' || Object.entries(r).some(([k,v])=>!keys.has(k) || recordKeys.has(k) || typeof v!=='string')))throw Error('default-file-records');
      } else if(typeof value!=='string')throw Error('default-file-field-type');
    }
    return profile;
  }
  function canonical(v) {
    if(Array.isArray(v))return v.map(canonical);
    if(v && typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
    return v;
  }
  function createLoader({readFile,hash,keys,validate,storage,commit}) {
    let inFlight=null;
    async function load() {
      const text=await readFile();
      // The optional packaged file must not block profiles created in the manager.
      if(text===null)return {ok:true,changed:false,source:'storage'};
      const next=decode(text,keys,validate),fingerprint=await hash(JSON.stringify(canonical(next)));
      const stored=await storage.get(['profile','defaultProfileFileHash']);
      if(stored.defaultProfileFileHash===fingerprint)return {ok:true,changed:false};
      const result=await commit({expected:stored.profile||{},next,checkpoint:true,clearDraft:true,label:'默认资料文件更新',defaultFileHash:fingerprint});
      if(!result.ok)throw Error('default-file-conflict');
      return {ok:true,changed:true};
    }
    return ()=>{
      if(!inFlight)inFlight=load().finally(()=>{inFlight=null;});
      return inFlight;
    };
  }
  const api={decode,createLoader};root.QIUZHAO_DEFAULT_PROFILE=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(globalThis);
