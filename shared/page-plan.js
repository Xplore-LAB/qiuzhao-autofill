/* Model output cannot supply selectors, scripts or personal values. */
(function(root) {
  const categories=new Set(['skillsBulk','certificatesBulk','competitionsBulk','honorsBulk','worksBulk','educationBulk','internshipsBulk','projectsBulk','awardsBulk','researchBulk','languagesBulk']);
  function validate(raw,input) {
    if(!raw || !Array.isArray(raw.controls) || !Array.isArray(raw.sections))throw Error('invalid-page-plan');
    const fields=new Set(input.fields.map(f=>f.key));
    function decisions(source,targets,section) {
      return targets.map(target=>{
        const matches=source.filter(item=>item && String(item.id)===target.id);
        if(matches.length!==1)return {id:target.id,status:'review',reason:'missing-or-duplicate-decision'};
        const item=matches[0];
        if(section && item.status==='classified' && categories.has(item.category) && Number.isFinite(item.confidence) && item.confidence>=.9)
          return {id:target.id,status:'classified',category:item.category};
        if(!section && item.status==='mapped' && fields.has(item.fieldKey) && Number.isFinite(item.confidence) && item.confidence>=.9)
          return {id:target.id,status:'mapped',fieldKey:item.fieldKey};
        const status=['review','unsupported','ignore'].includes(item.status)?item.status:'review';
        return {id:target.id,status,reason:status==='review'?'needs-review':status};
      });
    }
    return {controls:decisions(raw.controls,input.controls,false),sections:decisions(raw.sections,input.sections,true)};
  }
  root.QIUZHAO_PAGE_PLAN={validate};
  if(typeof module!=='undefined' && module.exports)module.exports=root.QIUZHAO_PAGE_PLAN;
})(globalThis);
