/* Site-specific boundaries; no generated CSS classes or profile persistence. */
(function(root){
  'use strict';
  const norm=value=>String(value||'').trim().replace(/\s+/g,'');
  function matches(location){return location.hostname==='zhuanzhuan.zhiye.com' && /^\/form\/?$/.test(location.pathname);}
  function scopes(doc,title,visible){
    const found=[];
    for(const add of doc.querySelectorAll('[id$="_addButton"]')){
      if(!visible(add)||norm(add.textContent)!=='添加'+title)continue;
      for(let node=add.parentElement,depth=0;node&&depth<8;node=node.parentElement,depth++){
        if(node.matches('body,html,form'))break;
        if(node.querySelectorAll('[id$="_addButton"]').length!==1)break;
        const heading=Array.from(node.querySelectorAll('div,span,h2,h3,h4,legend,[role="heading"]')).find(el=>visible(el)&&norm(el.textContent)===title);
        if(heading){found.push({root:node,add,title});break;}
      }
    }
    return found;
  }
  // Existing rows are identities, not positions. Ambiguity never creates a duplicate.
  function bind(records,rows,keys){
    const primary=keys[0],claimed=new Set();
    const compatible=(a,b)=>keys.every(k=>!norm(a[k])||!norm(b[k])||norm(a[k])===norm(b[k]));
    const same=(a,b)=>norm(a[primary]) && norm(a[primary])===norm(b[primary]);
    return records.map((record,index)=>{
      if(!norm(record[primary]))return {reason:'record-identity-missing'};
      if(records.some((other,i)=>i!==index&&same(record,other)&&compatible(record,other)))return {reason:'source-record-ambiguous'};
      const candidates=rows.map((row,i)=>({row,i})).filter(({row})=>same(record,row.values)&&compatible(record,row.values));
      if(candidates.length===1&&!claimed.has(candidates[0].i)){
        claimed.add(candidates[0].i);return {row:candidates[0].i,reason:'identity-match'};
      }
      if(candidates.length || rows.some(row=>same(record,row.values)))return {reason:'existing-record-ambiguous'};
      if(rows.some(row=>!row.empty&&!norm(row.values[primary])))return {reason:'partial-record-unresolved'};
      const blank=rows.findIndex((row,i)=>row.empty&&!claimed.has(i));
      if(blank>=0){claimed.add(blank);return {row:blank,reason:'empty-record'};}
      return {reason:'new-record-required'};
    });
  }
  root.QIUZHAO_ZHUANZHUAN={matches,scopes,bind};
})(globalThis);
