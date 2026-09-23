// Explicit demo bindings stand in for the future semantic/value resolver.
// Neither the browser tool nor the scanner knows profile field names.
function bind(control, profile) {
  const direct = {'姓名':'name', '毕业院校':'school', '项目日期范围':'range', '工作地区':'region', '框架内姓名':'frameName', '影子内姓名':'shadowName', '联系邮箱':'email'};
  const match = control.section.match(/^教育经历 (\d+)$/);
  if (match && control.label === '学校名称') return profile.educations[Number(match[1])-1]?.school;
  return profile[direct[control.label]];
}

async function run(tool, profile, {repeats, settleMs=350} = {}) {
  if (repeats) {
    await tool.ensureRepeatedRecords(repeats, profile.educations.length);
  }
  const controls = await tool.observePage(), results = [];
  for (const control of controls) {
    const kind = await tool.inspect(control), value = bind(control, profile);
    const result = {id:control.id,label:control.label,section:control.section,required:control.required,kind};
    if (['manual','blocked','unsupported'].includes(kind)) result.status = kind;
    else if (value === undefined || value === '') result.status = 'missing';
    else if (control.value && !['请选择'].includes(control.value)) result.status = 'existing-unverified';
    else {
      try {
        await tool.write(control, value);
        const check = await tool.verify(control, value, settleMs);
        result.status = check.ok ? 'verified' : 'failed';
        if (!check.ok) result.reason = 'value-reverted-or-invalid';
      } catch(error) {
        result.status = 'failed';
        result.reason = String(error.message).split('\n')[0];
        await tool.dismiss(control);
      }
    }
    results.push(result);
  }
  // New application controls discovered during execution must not vanish.
  const discovered = await tool.observePage();
  for (const control of discovered) {
    const result = results.find(r=>r.id===control.id);
    if (result?.status === 'verified') {
      const check = await tool.verify(control, bind(control, profile), 0);
      if (!check.ok) {result.status='failed';result.reason='final-value-reverted-or-invalid';}
    }
  }
  for (const result of results) if (result.status==='verified' && !discovered.some(c=>c.id===result.id)) {result.status='failed';result.reason='control-disappeared-needs-review';}
  for (const control of discovered) if (!results.some(r=>r.id===control.id)) results.push({id:control.id,label:control.label,required:control.required,status:'manual',reason:'new-control-needs-planning'});
  return {results, complete:results.filter(r=>r.required).every(r=>r.status==='verified'), calls:tool.calls};
}
module.exports = {run};
