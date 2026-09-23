/* Deterministic, local resume extraction. Unknown values remain absent; never infer consent or identity. */
(function(root) {
  const groups = {
    education: { bulk: 'educationBulk', name: 'educationSchool', start: 'educationStartDate', end: 'educationEndDate' },
    internship: { bulk: 'internshipsBulk', name: 'internshipCompany', start: 'internshipStartDate', end: 'internshipEndDate', description: 'internshipContent' },
    project: { bulk: 'projectsBulk', name: 'projectName', start: 'projectStartDate', end: 'projectEndDate', description: 'projectDescription' },
    award: { bulk: 'awardsBulk', name: 'awardName', description: 'awardDescription' },
  };
  const basicLabels = {
    name: ['姓名','Name'], phone: ['手机号','手机','联系电话','电话','Phone','Mobile'], email: ['电子邮箱','邮箱','Email','E-mail'],
    gender: ['性别'], birthDate: ['出生日期','出生年月'], politicalStatus: ['政治面貌'], nation: ['民族'],
    household: ['户籍','籍贯'], wechat: ['微信号','微信'], homepage: ['个人主页','GitHub','Website'],
    expectedCity: ['期望工作地点','意向城市'], expectedPosition: ['求职意向','期望职位','意向岗位'],
  };
  const groupLabels = {
    education: { educationSchool: ['学校名称','毕业院校','学校','院校','School','University'], educationMajor: ['专业名称','专业','Major'], educationDegree: ['学历','学位','Degree'], educationStartDate: ['入学时间','开始时间'], educationEndDate: ['毕业时间','结束时间'], educationCollege: ['学院'], gpa: ['GPA','绩点'], educationRank: ['专业排名','排名'], trainingMethod: ['培养方式'] },
    internship: { internshipCompany: ['单位名称','公司名称','公司','单位','Company'], internshipRole: ['实习岗位','岗位','职位','角色','Position','Role'], internshipStartDate: ['开始时间'], internshipEndDate: ['结束时间'], internshipContent: ['实习内容','工作内容','工作职责','实习描述','职责','描述','Description'] },
    project: { projectName: ['项目名称','项目','Project'], projectRole: ['项目角色','项目职务','角色','Role'], projectStartDate: ['开始时间'], projectEndDate: ['结束时间'], projectDescription: ['项目描述','项目内容','项目职责','职责','描述','Description'], projectUrl: ['项目链接'] },
    award: { awardName: ['奖励名称','奖项名称','奖项','名称'], awardDate: ['颁发时间','获奖时间','时间'], awardLevel: ['奖励级别','获奖级别','级别'], awardDescription: ['奖励描述','获奖描述','描述'] },
  };
  const headings = [
    ['basic', /^(?:基本信息|个人信息|联系方式|求职意向|personal(?: information| details)?|contact(?: information)?|profile)$/i],
    ['education', /^(?:教育背景|教育经历|学习经历|education(?:al background)?)$/i],
    ['internship', /^(?:实习经历|实习经验|实习实践|internship(?:s| experience)?)$/i],
    ['project', /^(?:项目经历|项目经验|科研项目|projects?|project experience)$/i],
    ['award', /^(?:获奖情况|获奖经历|荣誉奖励|奖励情况|荣誉奖项|奖项荣誉|awards?(?: and honors)?|honors?)$/i],
    ['intro', /^(?:自我评价|个人简介|自我介绍|summary|professional summary)$/i],
    ['skills', /^(?:专业技能|技能特长|语言能力|技能证书|技能|skills|languages?|certifications?)$/i],
    // Preserve unsupported sections as source text; do not misclassify jobs as internships.
    ['other', /^(?:工作经历|工作经验|校园经历|校园活动|社会实践|其他信息|家庭情况|紧急联系人|推荐人|work experience|employment(?: history)?|references)$/i],
  ];
  const dateToken = '(?:19|20)\\d{2}(?:[./年-]\\d{1,2}(?:[./月-]\\d{1,2}日?)?月?)?';
  const rangePattern = new RegExp('('+dateToken+')\\s*(?:至|到|~|～|—|–|－|--?|to)\\s*('+dateToken+'|至今|现在|present|current)(?![\\d./年月])', 'i');
  function date(value) {
    const raw = String(value).trim();
    if (/^(至今|现在|present|current)$/i.test(raw)) return '至今';
    const match = raw.match(/^(19\d{2}|20\d{2})(?:[./年-](\d{1,2})(?:[./月-](\d{1,2})日?)?月?)?$/);
    if (!match) return '';
    const [,y,m,d] = match;
    if (m && (+m<1 || +m>12)) return '';
    if (d && (+d<1 || +d>new Date(Date.UTC(+y,+m,0)).getUTCDate())) return '';
    return [y,m?.padStart(2,'0'),d?.padStart(2,'0')].filter(Boolean).join('-');
  }
  function degree(text) {
    if (/博士|Ph\.?D\.?|Doctorate/i.test(text)) return '博士';
    if (/硕士|Master|M\.?Sc\.?/i.test(text)) return '硕士';
    if (/本科|学士|Bachelor|B\.?Sc\.?/i.test(text)) return '本科';
    if (/专科|大专|Associate/i.test(text)) return '专科';
    return '';
  }
  const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  function labels(line, map) {
    const pairs = Object.entries(map).flatMap(([key,names])=>names.map(name=>[name,key])).sort((a,b)=>b[0].length-a[0].length);
    const keys = new Map(pairs.map(([name,key])=>[name.toLowerCase(),key]));
    const re = new RegExp('(?:^|[\\s|;；,，/])('+pairs.map(([name])=>escape(name)).join('|')+')\\s*[:：]\\s*','gi');
    const matches = [...line.matchAll(re)];
    return matches.map((m,i)=>[keys.get(m[1].toLowerCase()),line.slice(m.index+m[0].length,matches[i+1]?.index).replace(/[\s|;；,，]+$/,'').replace(/\s+\/$/,'').trim()]);
  }
  function parseResume(text) {
    if (typeof text !== 'string' || text.length > 300000) throw Error('简历文本为空或超过 30 万字符');
    const profile = {}, evidence = {}, warnings = new Set(), ambiguous = new WeakMap();
    const lines = text.normalize('NFKC').replace(/\r\n?/g,'\n').split('\n').map(s=>s.replace(/^[\s•●▪◆·]+/,'').trim()).filter(Boolean);
    let section = 'basic', record = {}, recordLines = [], intro = [];
    const records = Object.fromEntries(Object.keys(groups).map(k=>[k,[]]));
    const recordEvidence = Object.fromEntries(Object.keys(groups).map(k=>[k,[]]));
    function put(target,key,value,line) {
      value = String(value || '').trim();
      if (!value) return;
      let blocked = ambiguous.get(target); if (!blocked) ambiguous.set(target,blocked=new Set());
      if (blocked.has(key)) return;
      if (target[key] && target[key]!==value) {
        delete target[key]; blocked.add(key); warnings.add('同一字段出现多个不同值，已留空，请核对原文。'); return;
      }
      target[key] = value;
      if (target===profile) evidence[key] = line;
    }
    function flush() {
      if (groups[section] && Object.keys(record).length) {
        if (record[groups[section].name]) {
          records[section].push(record); recordEvidence[section].push(recordLines.join('\n'));
        } else warnings.add('有经历缺少名称，未自动加入；请查看原文补充。');
      }
      record = {}; recordLines = [];
    }
    function setField(target,key,value,line) {
      if (/Date$/.test(key)) {
        const parsed = date(value);
        if (!parsed || (parsed==='至今' && !/EndDate$/.test(key))) { warnings.add('有日期无法确认，已留空，请核对原文。'); return; }
        value = parsed;
      }
      if (key==='educationDegree') { value=degree(value); if (!value) return; }
      if (key==='phone') { value=value.replace(/[\s()-]/g,'').replace(/^\+?86(?=1\d{10}$)/,''); if (!/^1[3-9]\d{9}$/.test(value)) return; }
      if (key==='email' && !/^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(value)) return;
      if (key==='gender' && !/^[男女]$/.test(value)) return;
      put(target,key,value,line);
    }
    for (let index=0; index<lines.length; index++) {
      const line = lines[index];
      const heading = line.replace(/[：:]$/,'').replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g,'');
      const nextSection = headings.find(([,re])=>re.test(heading))?.[0];
      if (nextSection) { flush(); section=nextSection; if (section==='other') warnings.add('部分栏目暂不支持本地结构化，已保留在原文中，可手动补充或使用 AI 提取。'); continue; }
      if (section==='basic') {
        // Never treat references' contact details as the applicant's details.
        if (/紧急联系人|推荐人|父亲|母亲|家属|reference/i.test(line)) continue;
        for (const [key,value] of labels(line,basicLabels)) setField(profile,key,value,line);
        for (const m of line.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)) put(profile,'email',m[0],line);
        for (const m of line.matchAll(/(?<!\d)(?:\+?86[ -]?)?(1[3-9]\d[ -]?\d{4}[ -]?\d{4})(?!\d)/g)) put(profile,'phone',m[1].replace(/[ -]/g,''),line);
        if ((index===0 || (index===1 && /简历|resume/i.test(lines[0]))) && /^[\u4e00-\u9fff]{2,4}$/.test(line) && !/简历|信息|工程|求职|应聘|应届|大学|学院|学历|专业|团员|党员/.test(line)) {
          put(profile,'name',line,line); warnings.add('姓名按简历首行提取，请确认该行确为本人姓名。');
        }
        continue;
      }
      if (section==='intro') { intro.push(line); continue; }
      if (section==='skills') {
        const cet=line.match(/(?:CET[- ]?|大学英语|英语)([四六46])(?:级)?\s*[:：-]?\s*(\d{3})?/i);
        if (cet) { put(profile,'englishLevel',/[六6]/.test(cet[1])?'CET-6':'CET-4',line); if(cet[2])put(profile,'englishScore',cet[2],line); }
        continue;
      }
      const config = groups[section]; if (!config) continue;
      const fields = labels(line,{...groupLabels[section],...(config.start?{__range:['起止时间','在读时间','时间','日期','Time','Dates']}:{})});
      const range = line.match(rangePattern);
      const named = fields.find(([key])=>key===config.name);
      const header = range ? line.replace(range[0],'').replace(/^(?:时间|日期|Time|Dates?)\s*[:：]/i,'').replace(/^[\s|,，:：;-]+|[\s|,，:：;-]+$/g,'') : line;
      const school = section==='education' && !fields.length && header.match(/(?:[\u4e00-\u9fff]{2,20}(?:大学|学院|中学)|[A-Za-z][A-Za-z .&'-]{1,70}(?:University|College|Institute(?: of Technology)?))/i)?.[0];
      const titleBeforeDates = ['project','internship'].includes(section) && !fields.length && !range && line.length<=80 && !/[。.!！:：]/.test(line) && rangePattern.test(lines[index+1]||'');
      const award = section==='award' && !fields.length && line.match(new RegExp('^('+dateToken+')\\s+[|:：-]?\\s*(.{2,80})$'));
      const starts = named || school || titleBeforeDates || award || (range && header && !fields.length);
      if (record[config.name] && starts) flush();
      recordLines.push(line);
      for (const [key,value] of fields) if (key!=='__range') setField(record,key,value,line);
      if (titleBeforeDates) put(record,config.name,line,line);
      if (award) { setField(record,'awardDate',award[1],line); put(record,'awardName',award[2],line); }
      if (range && config.start) {
        setField(record,config.start,range[1],line); setField(record,config.end,range[2],line);
        if (record[config.start] && record[config.end] && record[config.end]!=='至今' && record[config.start]>record[config.end]) {
          delete record[config.start]; delete record[config.end]; warnings.add('经历起止日期顺序异常，已留空，请核对。');
        }
      }
      if (school) {
        put(record,config.name,school,line);
        const d=degree(header); if(d)put(record,'educationDegree',d,line);
        const pieces=header.split(/[|｜\t]| {2,}/).map(s=>s.trim()).filter(Boolean);
        const major=pieces.filter(s=>!s.includes(school) && !degree(s) && !/GPA|绩点|排名/i.test(s));
        if(major.length===1)put(record,'educationMajor',major[0],line);
      } else if (range && header && !fields.length && !record[config.name]) {
        const pieces=header.split(/[|｜\t]| {2,}/).map(s=>s.trim()).filter(Boolean);
        put(record,config.name,pieces[0],line);
        if (pieces[1] && section==='internship') put(record,'internshipRole',pieces[1],line);
        if (pieces[1] && section==='project') put(record,'projectRole',pieces[1],line);
      } else if (!fields.length && !range && section==='education') {
        const d=degree(line); if(d)put(record,'educationDegree',d,line);
      } else if (!fields.length && !range && !titleBeforeDates && !award && config.description && record[config.name]) {
        record[config.description]=[record[config.description],line].filter(Boolean).join('\n');
      }
    }
    flush();
    if (intro.length) put(profile,'intro',intro.join('\n'),intro.join('\n'));
    for (const [kind,items] of Object.entries(records)) if (items.length) {
      profile[groups[kind].bulk]=items; evidence[groups[kind].bulk]=recordEvidence[kind].join('\n\n');
    }
    // Mirror one explicitly identified highest degree for websites with a single education field.
    const ranked=records.education.filter(r=>r.educationDegree).sort((a,b)=>['专科','本科','硕士','博士'].indexOf(b.educationDegree)-['专科','本科','硕士','博士'].indexOf(a.educationDegree));
    if(ranked.length && (!ranked[1] || ranked[0].educationDegree!==ranked[1].educationDegree)) {
      const top=ranked[0], origin=recordEvidence.education[records.education.indexOf(top)];
      for(const [from,to] of Object.entries({educationSchool:'school',educationMajor:'major',educationDegree:'degree',educationEndDate:'graduationDate'})) {
        if(top[from] && top[from]!=='至今')put(profile,to,top[from],origin);
      }
    }
    const missing=[['name','姓名'],['phone','手机号'],['email','邮箱']].filter(([key])=>!profile[key]).map(([,name])=>name);
    if(missing.length)warnings.add('未确认'+missing.join('、')+'，请核对或补充。');
    warnings.add('本地解析可能遗漏复杂排版、未标注字段或跨栏内容；请核对经历分组和日期。');
    return { profile, evidence, warnings:[...warnings] };
  }
  const api={parseResume}; root.QIUZHAO_RESUME_PARSER=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})(globalThis);
