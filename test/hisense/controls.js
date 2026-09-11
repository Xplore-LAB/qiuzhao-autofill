/* Sanitized behavioral reconstruction from observed Hisense Phoenix DOM.
   This fixture models selected event contracts, not the proprietary site implementation. */
(() => {
  const mode = new URLSearchParams(location.search).get('case') || 'happy';
  const profile = {politicalStatus:'群众', nation:'汉族', household:'山东省青岛市市南区'};
  const model = {}, events = [], anchors = {}, checks = [];
  let saved = null, submitClicks = 0, listener;
  const log = (action, field, value='') => events.push({action,field,value});
  const el = (tag, cls='', text='') => {const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  const check = (id, expected, actual) => checks.push({id,expected,actual,pass:JSON.stringify(expected)===JSON.stringify(actual)});
  function close() {document.querySelectorAll('.common-unmodeled-layer').forEach(n=>n.remove());}
  document.addEventListener('keydown', e=>{if(e.key==='Escape')close();});
  function paint(key,value) {
    const a=anchors[key];a.querySelector('input').value=value;
    a.querySelector('.phoenix-select__tipEle').textContent=value;
    const p=a.querySelector('.phoenix-select__placeHolder');p.textContent=value||'请选择';
    p.classList.toggle('phoenix-select__placeHolder--show',!value);
  }
  function commit(key,value,layer) {
    model[key]=value;paint(key,value);log('commit',key,value);layer.remove();
  }
  function layerFor(key) {
    close();const layer=el('div','common-unmodeled-layer');document.body.append(layer);
    log('open',key);return layer;
  }
  function footer(layer,confirm) {
    const cancel=el('button','','取消');cancel.onclick=()=>layer.remove();
    const ok=el('button','phoenix-button','确定');ok.onclick=confirm;
    layer.append(cancel,ok);return ok;
  }
  function searchMenu(key) {
    const layer=layerFor(key), search=el('input'), list=el('ul','phoenix-selectList__list');
    search.placeholder='搜索';layer.append(search,list);
    const render=text=>{
      list.replaceChildren();
      for(const value of text ? (mode==='missing-option'?[]:['群众']) : ['中共党员','中国共产党预备党员']){
        const item=el('li','phoenix-selectList__listItem',value);
        item.onclick=()=>commit(key,value,layer);list.append(item);
      }
    };
    render('');let timer;
    search.addEventListener('input',()=>{log('search',key,search.value);clearTimeout(timer);list.replaceChildren();timer=setTimeout(()=>render(search.value),220);});
    footer(layer,()=>{});
  }
  function nationMenu(key) {
    const layer=layerFor(key), row=el('div','list-item-container'), icon=el('span','icon-container');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('RadioUnchecked');
    const selected=el('div','select-data-container');let picked=false;
    // The real failure: parent span clicks do not reach this SVG listener.
    svg.addEventListener('click',()=>{log('select',key,'汉族');setTimeout(()=>{picked=true;svg.classList.replace('RadioUnchecked','RadioChecked');selected.textContent='汉族';},180);});
    icon.append(svg);row.append(icon,el('span','item-text-label','汉族'));layer.append(row,selected);
    footer(layer,()=>{if(picked){if(mode==='rollback'){layer.remove();log('rollback',key);}else commit(key,'汉族',layer);}});
  }
  function areaMenu(key) {
    const layer=layerFor(key), root=el('div','area-selector-container'), data=el('div','area-data-container'), selected=el('div','select-data-container');
    root.append(data,selected);layer.append(root);
    const names=['山东省','青岛市','市南区'];let chosen='';
    function render(depth) {
      data.replaceChildren();const row=el('div','area-item-container'), label=el('span','area-text-label',names[depth]);
      const icon=el('span','icon-container'),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.append(svg);
      row.append(icon,label);if(depth<2)row.append(el('span','area-icon-right visible'));
      label.onclick=()=>{if(depth<2){log('expand',key,names[depth]);setTimeout(()=>render(depth+1),160);}};
      svg.addEventListener('click',()=>{chosen=names.slice(0,depth+1).join('/');selected.textContent=chosen;log('select',key,chosen);});
      data.append(row);
    }
    render(0);footer(layer,()=>{if(chosen.split('/').length===3)commit(key,chosen,layer);});
  }
  for(const [key,label,open] of [['politicalStatus','政治面貌',searchMenu],['nation','民族',nationMenu],['household','籍贯（维护到最后一级）',areaMenu]]) {
    const row=el('div','form-item'), a=el('div','phoenix-select');a.dataset.test=key;
    const input=el('input');input.setAttribute('aria-label',label);
    input.addEventListener('input',()=>log('anchor-input',key,input.value));
    a.append(el('span','phoenix-select__placeHolder phoenix-select__placeHolder--show','请选择'),el('span','phoenix-select__tipEle'),input);
    row.append(el('label','form-item__text',label),a);document.querySelector('#form').append(row);anchors[key]=a;
    a.onclick=()=>open(key);
  }
  document.querySelector('#save').onclick=()=>{saved=JSON.parse(JSON.stringify(model));log('save','fixture');};
  document.querySelector('#restore').onclick=()=>{for(const key of Object.keys(anchors)){delete model[key];paint(key,'');}Object.assign(model,saved||{});for(const key of Object.keys(anchors))paint(key,model[key]||'');log('restore','fixture');};
  document.querySelector('#submit').onclick=()=>submitClicks++;
  window.chrome={storage:{local:{get:async()=>({profile,settings:{autoFill:false},learned:{},siteRules:{}}),set:async()=>{}},onChanged:{addListener(){}}},runtime:{onMessage:{addListener(fn){listener=fn;}},sendMessage:async()=>{throw Error('Unexpected AI call in deterministic fixture');}}};
  window.runHisense=async()=>{
    try {
      const result=await new Promise(resolve=>listener({type:'FILL_FORM',overwrite:true,useAI:false,selfCheck:true},null,resolve));
      const expected={politicalStatus:mode==='missing-option'?'':'群众',nation:mode==='rollback'?'':'汉族',household:'山东省/青岛市/市南区'};
      for(const [key,value] of Object.entries(expected)){
        check(key+'.dom',value,anchors[key].querySelector('input').value);
        check(key+'.model',value,model[key]||'');
      }
      check('search.correctInput',true,events.some(e=>e.action==='search'&&e.value==='群众'));
      check('search.noAnchorWrite',0,events.filter(e=>e.action==='anchor-input').length);
      check('area.expandOrder',['山东省','青岛市'],events.filter(e=>e.action==='expand').map(e=>e.value));
      check('summary.verified',Object.values(expected).filter(Boolean).length,result.filled?.length);
      check('summary.failed',mode==='happy'?0:1,result.failed?.length);
      check('selfCheck.verified',Object.values(expected).filter(Boolean).length,result.selfCheck?.counts.verified);
      check('selfCheck.failed',mode==='happy'?0:1,result.selfCheck?.counts.failed);
      check('layers.closed',0,document.querySelectorAll('.common-unmodeled-layer').length);
      check('submit.untouched',0,submitClicks);
      document.querySelector('#save').click();for(const key of Object.keys(anchors))paint(key,'');document.querySelector('#restore').click();
      for(const [key,value] of Object.entries(expected))check(key+'.simulatedRestore',value,anchors[key].querySelector('input').value);
      const report={id:mode,engine:navigator.userAgent.includes('jsdom')?'jsdom':'browser',checks,events,summary:result,pass:checks.every(c=>c.pass)};
      window.__hisenseReport=report;
      document.querySelector('#result').textContent=(report.pass?'PASS':'FAIL')+' '+checks.filter(c=>c.pass).length+'/'+checks.length+' 项';
      for(const c of checks){const row=el('tr');for(const text of [c.id,JSON.stringify(c.expected),JSON.stringify(c.actual),c.pass?'通过':'失败'])row.append(el('td',c.pass?'pass':'fail',text));document.querySelector('#checks').append(row);}
      document.querySelector('#events').textContent=JSON.stringify(events,null,2);
    }catch(error){window.__hisenseReport={id:mode,pass:false,error:String(error),checks,events};document.querySelector('#result').textContent='FAIL '+error;}
  };
})();
