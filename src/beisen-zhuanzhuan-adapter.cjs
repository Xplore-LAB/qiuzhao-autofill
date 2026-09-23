const HOST = /^https:\/\/zhuanzhuan\.zhiye\.com\//;
const SECTION_SELECTOR = 'div[class*="sc-iAKWXU"]';

const EDUCATION = {
  title: '教育经历', primaryLabel: '学校名称',
  text: {educationSchool:'学校名称', educationMajor:'专业名称'},
  dates: {educationStartDate:'开始时间', educationEndDate:'结束时间'},
  choices: {educationDegree:'学历', academicDegree:'学位'},
};
const WORK = {
  title: '工作经历', primaryLabel: '公司名称',
  text: {internshipCompany:'公司名称', internshipRole:'职位名称', internshipContent:'工作职责'},
  dates: {internshipStartDate:'开始时间', internshipEndDate:'结束时间'},
  choices: {},
};

async function one(locator, reason) {
  const count = await locator.count();
  if (count !== 1) throw Error(`${reason}:${count}`);
  return locator.first();
}

async function section(page, title) {
  return one( page.locator(SECTION_SELECTOR).filter({has: page.getByText(title, {exact:true})}), `section-${title}` );
}

async function fieldRow(root, label, index) {
  const labels = root.locator('label').filter({hasText:label});
  if (await labels.count() <= index) throw Error(`field-${label}-${index}-missing`);
  return labels.nth(index).locator('..');
}

async function fieldInput(root, label, index) {
  const row = await fieldRow(root, label, index);
  const input = row.locator('input,textarea');
  return {row, input:await one(input, `input-${label}-${index}`)};
}

async function fillText(root, label, index, value) {
  const {input} = await fieldInput(root, label, index);
  if (!await input.isEditable()) throw Error(`input-${label}-readonly`);
  await input.fill(String(value));
  if (await input.inputValue() !== String(value)) throw Error(`input-${label}-readback`);
}

async function fillDate(root, label, index, value) {
  const {input} = await fieldInput(root, label, index);
  if (!await input.isEditable()) throw Error(`date-${label}-readonly`);
  await input.fill(String(value));
  await input.press('Enter');
  if (!(await input.inputValue()).includes(String(value))) throw Error(`date-${label}-readback`);
}

async function choose(page, root, label, index, value) {
  const {row, input} = await fieldInput(root, label, index);
  await input.click();
  const candidates = page.getByText(String(value), {exact:true});
  const visible = [];
  for (let i = 0; i < await candidates.count(); i++) if (await candidates.nth(i).isVisible()) visible.push(i);
  if (visible.length !== 1) throw Error(`choice-${label}-ambiguous:${visible.length}`);
  await candidates.nth(visible[0]).click();
  if (!(await row.textContent()).includes(String(value))) throw Error(`choice-${label}-readback`);
}

async function ensureRecords(page, root, spec, wantedCount) {
  if (wantedCount > 20) throw Error('too-many-records');
  const labels = root.locator('label').filter({hasText:spec.primaryLabel});
  const add = await one(root.locator('[id$="_addButton"]'), `add-${spec.title}`);
  while (await labels.count() < wantedCount) {
    const before = await labels.count();
    await add.click();
    await labels.nth(before).waitFor({state:'visible', timeout:2000});
  }
}

async function fillRecords(page, spec, records, report) {
  if (!records.length) return;
  const root = await section(page, spec.title);
  await ensureRecords(page, root, spec, records.length);
  for (const [index, record] of records.entries()) {
    for (const [key, label] of Object.entries(spec.text)) if (record[key]) await capture(report, `${spec.title}.${index}.${key}`, () => fillText(root, label, index, record[key]));
    for (const [key, label] of Object.entries(spec.dates)) if (record[key]) await capture(report, `${spec.title}.${index}.${key}`, () => fillDate(root, label, index, record[key]));
    for (const [key, label] of Object.entries(spec.choices)) if (record[key]) await capture(report, `${spec.title}.${index}.${key}`, () => choose(page, root, label, index, record[key]));
  }
}

async function capture(report, field, operation) {
  try { await operation(); report.verified.push(field); }
  catch (error) { report.pending.push({field, reason:String(error.message)}); }
}

async function fillProfile(page, profile) {
  if (!HOST.test(page.url())) throw Error('zhuanzhuan-host-required');
  const report = {verified:[], pending:[], saved:false, submitted:false};
  const personal = await section(page, '个人信息');
  for (const [key, label] of Object.entries({name:'姓名', email:'邮箱', phone:'手机号码'})) {
    if (profile[key]) await capture(report, `个人信息.${key}`, () => fillText(personal, label, 0, profile[key]));
  }
  await fillRecords(page, EDUCATION, Array.isArray(profile.educationBulk) ? profile.educationBulk : [], report);
  await fillRecords(page, WORK, Array.isArray(profile.internshipsBulk) ? profile.internshipsBulk : [], report);
  return report;
}

module.exports = {HOST, EDUCATION, WORK, fillProfile};
