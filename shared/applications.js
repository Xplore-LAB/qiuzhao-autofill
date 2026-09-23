/* Local job metadata only. Never infer a submitted application from an autofill run. */
(function(root){
  'use strict';
  const STORAGE_KEY='qiuzhaoApplicationsV1';
  const MAX_RECORDS=1000, MAX_BYTES=4*1024*1024;
  const STATUSES=Object.freeze({saved:'收藏',pending:'待投递',submitted:'已投递',test:'笔试',interview:'面试',offer:'Offer',closed:'结束'});
  const LIMITS={title:200,company:200,location:200,notes:5000,description:12000};
  const has=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  function plain(value){return value&&typeof value==='object'&&!Array.isArray(value);}
  function text(value,key){
    if(value==null)return '';
    if(typeof value!=='string')throw new Error('岗位字段必须是文字');
    const cleaned=value.replace(/\u0000/g,'').trim();
    if(cleaned.length>LIMITS[key])throw new Error(`${key==='notes'?'备注':'岗位信息'}过长（最多 ${LIMITS[key]} 字）`);
    return cleaned;
  }
  function cleanParams(params){
    for(const key of [...params.keys()])if(/^utm_/i.test(key)||/^(gclid|fbclid|msclkid|dclid|yclid|_ga|_gl|spm)$/i.test(key))params.delete(key);
    params.sort();
  }
  function normalizeUrl(value){
    if(typeof value!=='string'||!value.trim()||value.length>2048)throw new Error('请输入有效的岗位链接（最多 2048 字）');
    let parsed;try{parsed=new URL(value.trim());}catch{throw new Error('岗位链接格式不正确');}
    if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('仅支持不含账号密码的 HTTP / HTTPS 岗位链接');
    // SPA route fragments identify distinct jobs; only ordinary in-page anchors are discarded.
    if(/^#[/!]/.test(parsed.hash)){
      const route=parsed.hash.slice(1),queryAt=route.indexOf('?');
      if(queryAt>=0){const params=new URLSearchParams(route.slice(queryAt+1));cleanParams(params);const query=params.toString();parsed.hash=route.slice(0,queryAt)+(query?'?'+query:'');}
    }else parsed.hash='';
    cleanParams(parsed.searchParams);
    return parsed.href;
  }
  function deadline(value){
    if(value==null||value==='')return '';
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw new Error('截止日期格式不正确');
    return value;
  }
  function metadata(input){
    const result={};
    for(const key of ['title','company','location','description'])if(has(input,key))result[key]=text(input[key],key);
    if(has(input,'deadline'))result.deadline=deadline(input.deadline);
    if(has(input,'source')){if(!['jsonld','page','manual'].includes(input.source))throw new Error('岗位来源不正确');result.source=input.source;}
    return result;
  }
  function cleanRecord(input){
    if(!plain(input)||typeof input.id!=='string'||!input.id||input.id.length>100)return null;
    if(input.source!==undefined&&!['jsonld','page','manual'].includes(input.source))return null;
    if(!has(STATUSES,input.status))return null;
    if([input.createdAt,input.updatedAt,input.submittedAt].some(value=>value!=null&&(!Number.isFinite(value)||value<0||value>8640000000000000)))return null;
    try{return {id:input.id,url:normalizeUrl(input.url),title:text(input.title,'title'),company:text(input.company,'company'),location:text(input.location,'location'),deadline:deadline(input.deadline),description:text(input.description,'description'),source:['jsonld','page','manual'].includes(input.source)?input.source:'manual',notes:text(input.notes,'notes'),status:has(STATUSES,input.status)?input.status:'saved',createdAt:Number.isFinite(input.createdAt)?input.createdAt:0,updatedAt:Number.isFinite(input.updatedAt)?input.updatedAt:0,submittedAt:Number.isFinite(input.submittedAt)?input.submittedAt:null};}catch{return null;}
  }
  function validateRecord(input){const record=cleanRecord(input);if(!record||!record.title)throw new Error('投递记录内容异常，请先备份本地数据');return record;}
  function validateRecords(records){
    if(!Array.isArray(records)||records.length>MAX_RECORDS)throw new Error('投递记录格式或数量异常，请先备份本地数据');
    const cleaned=records.map(validateRecord);
    if(new Set(cleaned.map(row=>row.id)).size!==cleaned.length||new Set(cleaned.map(row=>row.url)).size!==cleaned.length)throw new Error('投递记录存在重复，请先备份本地数据');
    return cleaned;
  }
  function createStore(storage,options={}){
    let queue=Promise.resolve();
    const now=options.now||Date.now;
    const makeId=options.makeId||(()=>root.crypto.randomUUID());
    function serial(operation){const next=queue.then(operation);queue=next.catch(()=>{});return next;}
    async function read(){
      const data=await storage.get(STORAGE_KEY),value=data[STORAGE_KEY];
      if(value!==undefined&&(!plain(value)||value.version!==1||!Array.isArray(value.applications)))throw new Error('投递记录格式异常，请先备份本地数据');
      const records=value?.applications||[];
      return validateRecords(records);
    }
    async function write(records){
      const value={version:1,applications:records};
      if(records.length>MAX_RECORDS)throw new Error(`最多保存 ${MAX_RECORDS} 个岗位，请先导出记录`);
      if(new TextEncoder().encode(JSON.stringify(value)).length>MAX_BYTES)throw new Error('投递记录空间已满，请精简备注后重试');
      await storage.set({[STORAGE_KEY]:value});
    }
    return {
      list(){return serial(async()=> (await read()).sort((a,b)=>b.updatedAt-a.updatedAt));},
      save(input){return serial(async()=>{
        if(!plain(input))throw new Error('缺少岗位信息');
        const url=normalizeUrl(input.url),info=metadata(input),records=await read();
        let record=records.find(item=>item.url===url);
        if(record){for(const [key,value] of Object.entries(info))if(value)record[key]=value;record.updatedAt=now();}
        else {if(!info.title)throw new Error('请填写岗位名称');record={id:makeId(),url,title:'',company:'',location:'',deadline:'',description:'',source:'manual',...info,notes:'',status:'saved',createdAt:now(),updatedAt:now(),submittedAt:null};records.push(record);}
        await write(records);return {...record};
      });},
      update(id,patch){return serial(async()=>{
        if(!plain(patch))throw new Error('缺少修改内容');
        const records=await read(),record=records.find(item=>item.id===id);
        if(!record)throw new Error('未找到岗位，请刷新后重试');
        const change=metadata(patch);
        if(has(change,'title')&&!change.title)throw new Error('请填写岗位名称');
        if(has(patch,'notes'))change.notes=text(patch.notes,'notes');
        if(has(patch,'status')){
          if(!has(STATUSES,patch.status))throw new Error('投递状态不正确');
          if(patch.status==='submitted'&&record.status!=='submitted'){
            if(patch.confirmedSubmitted!==true)throw new Error('请确认已在招聘网站完成正式提交');
            change.submittedAt=now();
          }
          change.status=patch.status;
        }
        Object.assign(record,change,{updatedAt:now()});await write(records);return {...record};
      });}
    };
  }
  function search(records,query='',status=''){
    const term=String(query).trim().toLocaleLowerCase();
    return records.filter(row=>(!status||row.status===status)&&(!term||[row.title,row.company,row.location,row.notes,row.description,row.url].some(value=>String(value||'').toLocaleLowerCase().includes(term))));
  }
  function exportJSON(records){return JSON.stringify({version:1,exportedAt:new Date().toISOString(),applications:validateRecords(records)},null,2);}
  function csvCell(value){
    let string=String(value??'');
    if(/^[\s\uFEFF]*[=+@-]/.test(string)||/^[\t\r\n]/.test(string))string="'"+string;
    return '"'+string.replace(/"/g,'""')+'"';
  }
  function exportCSV(records){
    const rows=[['岗位','公司','地点','链接','状态','截止日期','岗位描述','来源','备注','收藏时间（UTC）','更新时间（UTC）','确认提交时间（UTC）']];
    const iso=value=>value?new Date(value).toISOString():'';
    for(const row of validateRecords(records))rows.push([row.title,row.company,row.location,row.url,STATUSES[row.status],row.deadline,row.description,({jsonld:'网页结构化数据',page:'网页提取',manual:'手动录入'})[row.source],row.notes,iso(row.createdAt),iso(row.updatedAt),iso(row.submittedAt)]);
    return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  }
  const api={STORAGE_KEY,MAX_RECORDS,STATUSES,normalizeUrl,validateRecord,validateRecords,createStore,search,exportJSON,exportCSV};
  root.QIUZHAO_APPLICATIONS=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
