/* Runtime contract: LIST -> {applications}; SAVE {application} / UPDATE {id,patch} -> {application}; all replies {ok,error?}. */
(function(){
  'use strict';
  const api=globalThis.QIUZHAO_APPLICATIONS,$=id=>document.getElementById(id);
  let records=[],busy=false;
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(className)element.className=className;return element;};
  function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
  async function send(type,payload={}){const response=await chrome.runtime.sendMessage({type,...payload});if(!response?.ok)throw new Error(response?.error||'无法读取本地记录，请重新加载扩展后重试');if(type==='APPLICATION_LIST')response.applications=api.validateRecords(response.applications);else response.application=api.validateRecord(response.application);return response;}
  function statusOptions(select,selected){for(const [key,label] of Object.entries(api.STATUSES)){const option=node('option',label);option.value=key;option.selected=key===selected;select.append(option);}}
  function field(form,label,name,value,type='text'){
    const wrap=node('label',label),input=node(type==='textarea'?'textarea':'input');input.name=name;
    if(type!=='textarea')input.type=type;
    input.value=value||'';if(name==='title')input.required=true;if(type!=='date')input.maxLength=name==='notes'?5000:name==='description'?12000:200;
    wrap.append(input);form.append(wrap);return {wrap,input};
  }
  function render(){
    const visible=api.search(records,$('search').value,$('status-filter').value);
    $('records').replaceChildren();$('count').textContent=`共 ${records.length} 个岗位 · 当前显示 ${visible.length} 个`;
    $('empty').hidden=visible.length>0;$('empty').textContent=records.length?'没有匹配的岗位，请调整搜索或状态。':'暂无岗位。打开招聘页面，在插件侧栏收藏岗位，或在上方手动添加。';
    $('export-json').disabled=$('export-csv').disabled=!records.length;
    for(const row of visible){
      const card=node('article',undefined,'record'),top=node('div',undefined,'record-top');
      const title=node('h2',row.title||'未命名岗位');top.append(title,node('span',api.STATUSES[row.status],'badge'));card.append(top);
      card.append(node('p',[row.company,row.location,row.deadline?`截止 ${row.deadline}`:''].filter(Boolean).join(' · ')||'公司与地点待补充','meta'));
      const link=node('a','打开岗位 ↗');link.href=api.normalizeUrl(row.url);link.target='_blank';link.rel='noopener noreferrer';link.title=row.url;card.append(link);
      card.append(node('p','来源：'+({jsonld:'网页结构化数据',page:'网页提取',manual:'手动录入'})[row.source],'meta source'));
      const description=node('details',undefined,'job-description');description.append(node('summary','查看岗位描述'),node('p',row.description||'暂无岗位描述'));card.append(description);
      if(row.notes)card.append(node('p',row.notes,'saved-notes'));
      const details=node('details'),summary=node('summary','编辑状态、资料与备注');details.append(summary);
      const form=node('form');field(form,'岗位名称','title',row.title);field(form,'公司','company',row.company);field(form,'地点','location',row.location);field(form,'截止日期','deadline',row.deadline,'date');
      const statusLabel=node('label','投递状态'),status=node('select');status.name='status';statusOptions(status,row.status);statusLabel.append(status);form.append(statusLabel);
      const confirmLabel=node('label',undefined,'check wide'),confirmed=node('input');confirmed.type='checkbox';confirmed.name='confirmedSubmitted';confirmLabel.append(confirmed,node('span','我已在招聘网站完成正式提交（填写完成不代表投递成功）'));confirmLabel.hidden=true;form.append(confirmLabel);
      status.addEventListener('change',()=>{const required=status.value==='submitted'&&row.status!=='submitted';confirmLabel.hidden=!required;confirmed.required=required;if(!required)confirmed.checked=false;});
      field(form,'岗位描述','description',row.description,'textarea').wrap.classList.add('wide');
      field(form,'备注 / 下一步','notes',row.notes,'textarea').wrap.classList.add('wide');
      const actions=node('div',undefined,'actions wide'),save=node('button','保存修改','primary'),feedback=node('span','','row-message');save.type='submit';feedback.setAttribute('role','status');actions.append(save,feedback);form.append(actions);
      form.addEventListener('submit',async event=>{
        event.preventDefault();if(save.disabled)return;save.disabled=true;feedback.textContent='保存中…';feedback.classList.remove('error');
        try{const data=new FormData(form),patch=Object.fromEntries(data.entries());patch.confirmedSubmitted=confirmed.checked;const result=await send('APPLICATION_UPDATE',{id:row.id,patch});records=records.map(item=>item.id===row.id?result.application:item);Object.assign(row,result.application);top.lastChild.textContent=api.STATUSES[row.status];title.textContent=row.title||'未命名岗位';card.querySelector('.meta').textContent=[row.company,row.location,row.deadline?`截止 ${row.deadline}`:''].filter(Boolean).join(' · ')||'公司与地点待补充';let notes=card.querySelector('.saved-notes');if(!notes&&row.notes){notes=node('p',undefined,'saved-notes');card.insertBefore(notes,details);}if(notes)notes.textContent=row.notes;description.lastChild.textContent=row.description||'暂无岗位描述';confirmed.required=false;confirmed.checked=false;confirmLabel.hidden=true;feedback.textContent='已保存';}
        catch(error){feedback.textContent=error.message;feedback.classList.add('error');}finally{save.disabled=false;}
      });
      details.append(form);card.append(details);$('records').append(card);
    }
  }
  $('add-form').addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;busy=true;const button=event.target.querySelector('button');button.disabled=true;
    try{const application={...Object.fromEntries(new FormData(event.target).entries()),source:'manual'};const result=await send('APPLICATION_SAVE',{application});records=[result.application,...records.filter(row=>row.id!==result.application.id)];event.target.reset();$('search').value='';$('status-filter').value='';render();message('岗位已收藏；重复收藏会保留原有状态与备注。');}catch(error){message(error.message,true);}finally{busy=false;button.disabled=false;}
  });
  function download(format){try{const content=format==='json'?api.exportJSON(records):api.exportCSV(records),url=URL.createObjectURL(new Blob([content],{type:format==='json'?'application/json;charset=utf-8':'text/csv;charset=utf-8'})),anchor=node('a');anchor.href=url;anchor.download=`秋招投递记录-${new Date().toISOString().slice(0,10)}.${format}`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message(`已导出全部 ${records.length} 条记录。`);}catch(error){message(error.message,true);}}
  $('export-json').addEventListener('click',()=>download('json'));$('export-csv').addEventListener('click',()=>download('csv'));
  $('search').addEventListener('input',render);$('status-filter').addEventListener('change',render);statusOptions($('status-filter'),'');
  send('APPLICATION_LIST').then(result=>{records=result.applications;render();message('');}).catch(error=>message(error.message,true));
})();
