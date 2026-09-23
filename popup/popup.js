/* 秋招网申自动填充助手 - popup 逻辑 v1.10.2
 * 职责：编辑/保存个人信息、触发当前页填充、学习记录管理、站点规则管理、JSON 备份导入导出。
 * 存储：profile / settings / learned / siteRules / aiSecrets 均在 chrome.storage.local。
 */

const FIELD_TABS = [
  {
    id: 'basic', fields: [
      { key: 'name', label: '姓名', ph: '张三' },
      { key: 'familyName', label: '姓', ph: '姓/名分开的表单用，选填' },
      { key: 'givenName', label: '名', ph: '姓/名分开的表单用，选填' },
      { key: 'gender', label: '性别', type: 'select', options: ['', '男', '女'] },
      { key: 'birthDate', label: '出生年月', ph: '1999-06 或 1999-06-15' },
      { key: 'politicalStatus', label: '政治面貌', type: 'select', options: ['', '中共党员', '中共预备党员', '共青团员', '民主党派', '无党派人士', '群众'] },
      { key: 'nation', label: '民族', ph: '汉族' },
      { key: 'household', label: '户籍/籍贯', ph: '广东潮州' },
      { key: 'householdType', label: '户口性质', type: 'select', options: ['', '农业户口', '非农业户口'] },
      { key: 'maritalStatus', label: '婚姻状况', type: 'select', options: ['', '未婚', '已婚', '离异'] },
      { key: 'height', label: '身高(cm)', ph: '175' },
      { key: 'weight', label: '体重(kg)', ph: '65' },
      { key: 'idNumber', label: '身份证号', ph: '' },
      { key: 'phone', label: '手机号', ph: '13800000000' },
      { key: 'email', label: '邮箱', ph: 'you@example.com' },
      { key: 'wechat', label: '微信号', ph: '' },
    ],
  },
  {
    id: 'edu', fields: [
      { key: 'school', label: '毕业院校', ph: '浙江大学' },
      { key: 'major', label: '专业', ph: '控制工程' },
      { key: 'degree', label: '学历/学位', type: 'select', options: ['', '专科', '本科', '硕士', '博士'] },
      { key: 'graduationDate', label: '毕业时间', ph: '2026-06' },
      { key: 'graduateStatus', label: '应届/往届', type: 'select', options: ['', '应届', '往届'] },
      { key: 'englishLevel', label: '英语等级', ph: 'CET-6' },
      { key: 'englishScore', label: '英语成绩', ph: '560' },
      { key: 'computerLevel', label: '计算机等级', ph: '全国计算机二级' },
      { key: 'gpa', label: 'GPA/绩点', ph: '3.8/4.0' },
      { key: 'rank', label: '专业排名', ph: '前10%' },
      { key: 'disciplineHighest', label: '最高学历学科', ph: '工学' },
      { key: 'disciplineBachelor', label: '本科学科', ph: '工学' },
      { key: 'educationBulk', label: '批量教育经历', type: 'records', ph: '每段用空行分隔；支持“学校：… / 专业：… / 时间：2022-09 至 2026-06”或 JSON 数组' },
      { key: '__divider_edu_detail', type: 'divider', label: '教育经历明细' },
      { key: 'educationSchool', label: '学校名称', ph: '留空则使用毕业院校' },
      { key: 'educationMajor', label: '专业名称', ph: '留空则使用专业' },
      { key: 'educationStartDate', label: '开始时间', ph: '2022-09' },
      { key: 'educationEndDate', label: '结束时间', ph: '留空则使用毕业时间' },
      { key: 'educationDegree', label: '学历', type: 'select', options: ['', '专科', '本科', '硕士', '博士'] },
      { key: 'educationDiscipline', label: '学科', ph: '工学' },
      { key: 'academicDegree', label: '学位', ph: '工学学士' },
      { key: 'trainingMethod', label: '培养方式', ph: '全日制' },
      { key: 'educationRank', label: '教育专业排名', ph: '留空则使用专业排名' },
      { key: 'unifiedRecruitment', label: '是否统招', type: 'select', options: ['', '是', '否'] },
      { key: 'overseasEducation', label: '是否海外留学', type: 'select', options: ['', '是', '否'] },
    ],
  },
  {
    id: 'intent', fields: [
      { key: 'expectedCity', label: '期望工作地点', ph: '深圳；省份+城市写「广东 深圳」' },
      { key: 'interviewSite', label: '期望面试站点', ph: '青岛' },
      { key: 'expectedPosition', label: '期望职位', ph: '算法工程师' },
      { key: 'expectedSalary', label: '期望薪资', ph: '25-35k' },
      { key: '__divider_1', type: 'divider', label: '补充信息' },
      { key: 'homepage', label: '个人主页/GitHub', ph: 'https://github.com/...' },
      { key: 'intro', label: '自我介绍', type: 'textarea', ph: '填入「自我评价/个人简介」类多行文本框' },
    ],
  },
  {
    id: 'experience', fields: [
      { key: 'projectsBulk', label: '批量项目经历', type: 'records', ph: '每段用空行分隔；支持“项目名称：… / 时间：… / 项目描述：…”或 JSON 数组' },
      { key: '__divider_project', type: 'divider', label: '项目经历' },
      { key: 'projectName', label: '项目名称', ph: '项目经历名称' },
      { key: 'projectStartDate', label: '开始时间', ph: '2024-03' },
      { key: 'projectEndDate', label: '结束时间', ph: '2024-08' },
      { key: 'projectDescription', label: '项目描述', type: 'textarea', ph: '职责、技术方案和成果' },
      { key: 'internshipsBulk', label: '批量实习经历', type: 'records', ph: '每段用空行分隔；支持“单位名称：… / 角色：… / 时间：… / 实习内容：…”或 JSON 数组' },
      { key: '__divider_internship', type: 'divider', label: '实习经历' },
      { key: 'internshipCompany', label: '单位名称', ph: '公司或单位名称' },
      { key: 'internshipRole', label: '角色', ph: '实习岗位或角色' },
      { key: 'internshipStartDate', label: '开始时间', ph: '2024-07' },
      { key: 'internshipEndDate', label: '结束时间', ph: '2024-09' },
      { key: 'internshipContent', label: '实习内容', type: 'textarea', ph: '工作职责和成果' },
    ],
  },
  {
    id: 'achievement', fields: [
      { key: 'languagesBulk', label: '批量语言能力', type: 'records', ph: '每段用空行分隔；支持“语言类型：英语 / 掌握程度：熟练”或 JSON 数组' },
      { key: '__divider_language', type: 'divider', label: '语言能力' },
      { key: 'languageType', label: '语言类型', ph: '英语' },
      { key: 'languageProficiency', label: '掌握程度', ph: '熟练' },
      { key: 'awardsBulk', label: '批量获奖与奖励情况', type: 'records', ph: '每段用空行分隔；支持“奖励名称：… / 颁发时间：… / 奖励级别：… / 奖励描述：…”或 JSON 数组' },
      { key: '__divider_award', type: 'divider', label: '获奖情况' },
      { key: 'awardName', label: '奖项', ph: '奖项名称' },
      { key: 'awardDate', label: '获奖时间', ph: '2025-06' },
      { key: 'awardLevel', label: '获奖级别', ph: '国家级' },
      { key: 'awardDescription', label: '获奖描述', type: 'textarea', ph: '奖项说明' },
      { key: 'researchBulk', label: '批量研究情况与成果', type: 'records', ph: '每段用空行分隔；可填写研究项目、课题、论文或专利，支持“名称：… / 时间：… / 类型：… / 研究内容：…”或 JSON 数组' },
      { key: '__divider_research', type: 'divider', label: '研究成果' },
      { key: 'researchName', label: '成果名称', ph: '论文或专利名称' },
      { key: 'researchDate', label: '成果时间', ph: '2025-06' },
      { key: 'researchLevel', label: '成果等级', ph: '核心期刊、发明专利等' },
      { key: 'researchDescription', label: '成果描述', type: 'textarea', ph: '成果说明' },
      {key: 'educationCollege', label: '学院', ph: ''},
      {key: 'educationLab', label: '实验室', ph: ''},
      {key: 'educationMentor', label: '导师姓名', ph: ''},
      {key: 'languageSpeaking', label: '听说能力', ph: ''},
      {key: 'languageWriting', label: '读写能力', ph: ''},
      {key: 'internshipAchievement', label: '工作业绩', ph: ''},
      {key: 'projectRole', label: '项目职务', ph: ''},
      {key: 'projectResponsibility', label: '项目职责', ph: ''},
      {key: 'researchChannel', label: '发布渠道', ph: ''},
      {key: 'researchAuthorOrder', label: '作者顺序', ph: ''},
      {key: 'researchUrl', label: '论文链接', ph: ''},
      {key: 'skillName', label: '技能类别', ph: ''},
      {key: 'skillLevel', label: '技能掌握程度', ph: ''},
      {key: 'certificateName', label: '技能证书', ph: ''},
      {key: 'competitionName', label: '竞赛名称', ph: ''},
      {key: 'competitionLevel', label: '竞赛获奖等级', ph: ''},
      {key: 'competitionDate', label: '竞赛获奖时间', ph: ''},
      {key: 'honorName', label: '荣誉名称', ph: ''},
      {key: 'workName', label: '作品名称', ph: ''},
      {key: 'workUrl', label: '作品链接', ph: ''},
      {key: 'skillsBulk', label: '批量IT技能', type: 'records', ph: '每条记录用空行分隔，或导入 JSON 数组'},
      {key: 'certificatesBulk', label: '批量技能证书', type: 'records', ph: '每条记录用空行分隔，或导入 JSON 数组'},
      {key: 'competitionsBulk', label: '批量竞赛获奖', type: 'records', ph: '每条记录用空行分隔，或导入 JSON 数组'},
      {key: 'honorsBulk', label: '批量其他荣誉', type: 'records', ph: '每条记录用空行分隔，或导入 JSON 数组'},
      {key: 'worksBulk', label: '批量作品信息', type: 'records', ph: '每条记录用空行分隔，或导入 JSON 数组'},
      { key: '__divider_questions', type: 'divider', label: '附加问题' },
      { key: 'willingAllocation', label: '服从公司分配', type: 'select', options: ['', '是', '否'] },
      { key: 'acceptRelocation', label: '接受外派', type: 'select', options: ['', '是', '否'] },
      { key: 'acceptUnderdevelopedOverseas', label: '接受海外欠发达地区', type: 'select', options: ['', '是', '否'] },
      { key: 'hasRelativesAtCompany', label: '亲属在本公司工作', type: 'select', options: ['', '是', '否'] },
    ],
  },
  {
    id: 'more', fields: [
      { key: 'recommendationCode', label: '推荐码', ph: '选填' },
      { key: 'otherLanguage', label: '其他外语', ph: '日语' },
      { key: 'otherLanguageLevel', label: '外语等级', ph: 'N2' },
      { key: 'scholarship', label: '奖学金', ph: '国家奖学金' },
      { key: 'outstandingGraduateLevel', label: '优秀毕业生级别', ph: '校级' },
      { key: 'practiceCount', label: '项目或实习数量', ph: '3' },
      { key: 'studentCadreLevel', label: '学生干部级别', ph: '院级' },
      { key: 'studentRoles', label: '学生干部职务', ph: '班长' },
      { key: 'competitionAwardLevel', label: '竞赛奖项级别', ph: '省级' },
      { key: 'recruitmentSource', label: '招聘信息来源', ph: '学校就业网' },
    ],
  },
];

const DEMO_PROFILE = {
  name: '演示用户', familyName: '演', givenName: '示用户', gender: '男',
  birthDate: '2000-01', politicalStatus: '群众', nation: '汉族',
  household: '山东省青岛市市南区', householdType: '非农业户口', maritalStatus: '未婚',
  height: '175', weight: '65', idNumber: '110101200001010010',
  phone: '13800138000', email: 'demo@example.com', wechat: 'demo_user_2026',
  school: '演示大学', major: '计算机科学与技术', degree: '本科',
  graduationDate: '2026-06', graduateStatus: '应届', englishLevel: '六级',
  englishScore: '520', computerLevel: '国家二级或同等水平', gpa: '3.6/4.0', rank: '前20%',
  disciplineHighest: '工学', disciplineBachelor: '工学', educationSchool: '演示大学',
  educationMajor: '计算机科学与技术', educationStartDate: '2022-09', educationEndDate: '2026-06',
  educationDegree: '本科', educationDiscipline: '工学', academicDegree: '工学学士',
  trainingMethod: '非定向（统招、并轨）', educationRank: '前20%', unifiedRecruitment: '是', overseasEducation: '否',
  educationBulk: `学校名称：青岛实验中学
专业名称：理科
时间：2019-09 至 2022-06
学历：高中
培养方式：非定向（统招、并轨）

学校名称：演示大学
专业名称：计算机科学与技术
时间：2022-09 至 2026-06
学历：本科
学科：工学
学位：学士
培养方式：非定向（统招、并轨）
专业排名：前20%
是否统招：是
是否海外留学：否`,
  expectedCity: '山东省青岛市市南区', interviewSite: '青岛', expectedPosition: '包装设计工程师',
  expectedSalary: '10k-15k', homepage: 'https://example.com',
  intro: '熟悉包装结构设计、三维建模与数据分析，具备跨团队协作和项目落地能力。',
  projectName: '智能包装设计系统', projectStartDate: '2024-03', projectEndDate: '2024-08',
  projectDescription: '负责需求分析、结构方案设计与原型验证，完成测试数据整理和设计迭代。',
  projectsBulk: `项目名称：智能包装设计系统
时间：2024-03 至 2024-08
项目描述：负责需求分析、结构方案设计与原型验证，完成测试数据整理和设计迭代。

项目名称：校园设备管理平台
时间：2024-10 至 2025-03
项目描述：负责前端交互、接口联调和测试验收，整理项目文档并完成性能优化。`,
  internshipCompany: '演示科技有限公司', internshipRole: '产品设计实习生',
  internshipStartDate: '2024-07', internshipEndDate: '2024-09',
  internshipContent: '参与包装方案调研、建模、样品测试与文档整理，协助推进设计优化。',
  internshipsBulk: `单位名称：演示科技有限公司
角色：产品设计实习生
时间：2024-07 至 2024-09
实习内容：参与包装方案调研、建模、样品测试与文档整理，协助推进设计优化。

单位名称：青岛示例制造有限公司
角色：研发实习生
时间：2025-01 至 2025-04
实习内容：参与产品测试、数据分析和问题跟踪，输出测试报告并协助完成方案迭代。`,
  languageType: '英语', languageProficiency: '熟练',
  languagesBulk: `语言类型：英语
掌握程度：熟练

语言类型：日语
掌握程度：入门`,
  awardName: '校级创新设计大赛一等奖', awardDate: '2024-12', awardLevel: '院校级',
  awardDescription: '完成创新包装方案设计并获得校级一等奖。',
  awardsBulk: `奖项：校级创新设计大赛一等奖
获奖时间：2024-12
获奖级别：院校级
获奖描述：完成创新包装方案设计并获得校级一等奖。

奖项：优秀学生奖学金
获奖时间：2024-06
获奖级别：院校级
获奖描述：学业成绩和综合表现优秀。

奖项：大学生创新创业竞赛二等奖
获奖时间：2025-05
获奖级别：省区级
获奖描述：负责方案设计、原型开发和现场答辩。`,
  researchName: '智能包装结构设计研究', researchDate: '2025-05', researchLevel: '校级',
  researchDescription: '研究包装结构参数与性能之间的关系，完成实验分析与成果整理。',
  researchBulk: `名称：智能包装结构设计研究
时间：2025-05
等级：校级
描述：研究包装结构参数与性能之间的关系，完成实验分析与成果整理。

名称：面向复杂表单的字段识别方法
时间：2025-08
等级：发明专利
描述：设计字段语义识别与交互控件适配方法。`,
  willingAllocation: '是', acceptRelocation: '是', acceptUnderdevelopedOverseas: '否', hasRelativesAtCompany: '否',
  recommendationCode: 'DEMO2026', otherLanguage: '日语', otherLanguageLevel: 'N2',
  scholarship: '院级(校级)奖学金1次', outstandingGraduateLevel: '校级', practiceCount: '2或3个',
  studentCadreLevel: '主席级别（含主席团）、班长、团支书', studentRoles: '班长', competitionAwardLevel: '院校级',
  recruitmentSource: '学校就业网/就业公众号', customs: [],
};

/* 站点规则可选的目标字段（与 content.js 的 FIELDS 保持一致） */
const RULE_FIELDS = [
  ['educationCollege', '学院'],
  ['educationLab', '实验室'],
  ['educationMentor', '导师姓名'],
  ['languageSpeaking', '听说能力'],
  ['languageWriting', '读写能力'],
  ['internshipAchievement', '工作业绩'],
  ['projectRole', '项目职务'],
  ['projectResponsibility', '项目职责'],
  ['researchChannel', '发布渠道'],
  ['researchAuthorOrder', '作者顺序'],
  ['researchUrl', '论文链接'],
  ['skillName', '技能类别'],
  ['skillLevel', '技能掌握程度'],
  ['certificateName', '技能证书'],
  ['competitionName', '竞赛名称'],
  ['competitionLevel', '竞赛获奖等级'],
  ['competitionDate', '竞赛获奖时间'],
  ['honorName', '荣誉名称'],
  ['workName', '作品名称'],
  ['workUrl', '作品链接'],
  ['name', '姓名'], ['familyName', '姓'], ['givenName', '名'], ['gender', '性别'],
  ['birthDate', '出生年月'], ['politicalStatus', '政治面貌'], ['nation', '民族'],
  ['household', '户籍/籍贯'], ['householdType', '户口性质'], ['maritalStatus', '婚姻状况'],
  ['height', '身高'], ['weight', '体重'], ['idNumber', '身份证号'], ['phone', '手机号'],
  ['email', '邮箱'], ['wechat', '微信号'], ['school', '毕业院校'], ['major', '专业'],
  ['degree', '学历/学位'], ['graduationDate', '毕业时间'], ['graduateStatus', '应届/往届'],
  ['englishLevel', '英语等级'], ['englishScore', '英语成绩'], ['computerLevel', '计算机等级'],
  ['gpa', 'GPA/绩点'], ['rank', '专业排名'], ['disciplineHighest', '最高学历学科'],
  ['disciplineBachelor', '本科学科'], ['educationSchool', '教育经历学校'],
  ['educationMajor', '教育经历专业'], ['educationStartDate', '入学时间'],
  ['educationEndDate', '教育结束时间'], ['educationDegree', '教育经历学历'],
  ['educationDiscipline', '教育经历学科'], ['academicDegree', '学位'], ['trainingMethod', '培养方式'], ['educationRank', '教育专业排名'],
  ['unifiedRecruitment', '是否统招'], ['overseasEducation', '是否海外留学'],
  ['expectedCity', '期望工作地点'], ['interviewSite', '期望面试站点'],
  ['expectedPosition', '期望职位'], ['expectedSalary', '期望薪资'], ['recommendationCode', '推荐码'],
  ['projectName', '项目名称'], ['projectStartDate', '项目开始时间'],
  ['projectEndDate', '项目结束时间'], ['projectDescription', '项目描述'],
  ['internshipCompany', '实习单位名称'], ['internshipRole', '实习角色'],
  ['internshipStartDate', '实习开始时间'], ['internshipEndDate', '实习结束时间'],
  ['internshipContent', '实习内容'],
  ['languageType', '语言类型'], ['languageProficiency', '语言掌握程度'],
  ['awardName', '奖项名称'], ['awardDate', '获奖时间'], ['awardLevel', '获奖级别'],
  ['awardDescription', '获奖描述'], ['researchName', '研究成果名称'], ['researchDate', '研究成果时间'],
  ['researchLevel', '研究成果等级'], ['researchDescription', '研究成果描述'],
  ['willingAllocation', '服从公司分配'], ['acceptRelocation', '接受外派'],
  ['acceptUnderdevelopedOverseas', '接受海外欠发达地区分配'], ['hasRelativesAtCompany', '亲属在本公司工作'],
  ['otherLanguage', '其他外语'], ['otherLanguageLevel', '其他外语等级'], ['scholarship', '奖学金'],
  ['outstandingGraduateLevel', '优秀毕业生级别'], ['practiceCount', '项目或实习数量'],
  ['studentCadreLevel', '学生干部级别'], ['studentRoles', '学生干部职务'],
  ['competitionAwardLevel', '竞赛奖项级别'], ['recruitmentSource', '招聘信息来源'],
  ['homepage', '个人主页'], ['intro', '自我介绍'],
];

const $ = (sel) => document.querySelector(sel);
const AI_PROVIDERS = globalThis.QIUZHAO_AI_PROVIDERS || [];

let profile = {};
let settings = {};
let learned = {};
let siteRules = {};
let siteObservations = {};
let aiSecrets = {};
let sourceMaterial = null;
let currentHost = '';

document.addEventListener('DOMContentLoaded', async () => {
  const defaultSync=await chrome.runtime.sendMessage({type:'LOAD_DEFAULT_PROFILE'}).catch(()=>({ok:false}));
  const store = await chrome.storage.local.get(['profile', 'settings', 'learned', 'siteRules', 'siteObservations', 'aiSecrets', 'sourceMaterial', 'pendingProfileUpdate']);
  profile = store.profile || {};
  settings = store.settings || {};
  learned = store.learned || {};
  siteRules = store.siteRules || {};
  siteObservations = store.siteObservations || {};
  aiSecrets = store.aiSecrets || {};
  sourceMaterial = store.sourceMaterial || null;
  if (!settings.aiProvider) settings.aiProvider = settings.aiEndpoint ? 'custom' : 'openai';
  if (aiSecrets.apiKey && !(aiSecrets.keys && aiSecrets.keys.custom)) {
    aiSecrets.keys = Object.assign({}, aiSecrets.keys, { custom: aiSecrets.apiKey });
    delete aiSecrets.apiKey;
    await chrome.storage.local.set({ settings, aiSecrets });
  }
  buildPanels();
  buildCustoms();
  buildLearned();
  buildSiteObservations();
  bind();
  renderSourceMaterial();
  await initProfileWorkflow(store);
  $('#defaultFileStatus').textContent=defaultSync?.ok?(defaultSync.source==='storage'?'使用本地保存的资料 · 可直接填写或导入，无需创建资料文件':'默认资料：content/个人资料.json'+(defaultSync.changed?' · 已应用文件更新':' · 文件未变化，保留管理页修改')):'默认资料文件读取失败；请检查文件并重新加载扩展。';
  if(!defaultSync?.ok)workflowStatus('默认资料文件不可用，现有资料保留。修正文件后再填写。',true);
  detectHost();
});

/* ---------- 构建 UI ---------- */

function buildPanels() {
  for (const tab of FIELD_TABS) {
    const sec = document.getElementById('tab-' + tab.id);
    for (const f of tab.fields) {
      if (f.type === 'divider') {
        const d = document.createElement('div');
        d.className = 'divider';
        d.textContent = f.label;
        sec.appendChild(d);
        continue;
      }
      const row = document.createElement('label');
      row.className = 'row';
      const name = document.createElement('span');
      name.className = 'row-label';
      name.textContent = f.label;

      let input;
      if (f.type === 'select') {
        input = document.createElement('select');
        for (const o of f.options) {
          const op = document.createElement('option');
          op.value = o;
          op.textContent = o || '（未填写）';
          input.appendChild(op);
        }
      } else if (f.type === 'textarea' || f.type === 'records') {
        input = document.createElement('textarea');
        input.rows = f.type === 'records' ? 7 : 3;
        if (f.type === 'records') row.classList.add('bulk-row');
      } else {
        input = document.createElement('input');
        input.type = 'text';
      }
      input.dataset.key = f.key;
      if (f.ph) input.placeholder = f.ph;
      const storedValue = profile[f.key];
      if(f.type==='select' && storedValue && !f.options.includes(storedValue)){const op=document.createElement('option');op.value=storedValue;op.textContent=storedValue+'（原资料）';input.append(op);}
      input.value = f.type === 'records' && storedValue && typeof storedValue !== 'string'
        ? JSON.stringify(storedValue, null, 2)
        : storedValue || '';
      input.dataset.originalText=input.value;
      row.append(name, input);
      sec.appendChild(row);
    }
  }
}

function customRow(c) {
  c = c || {};
  const row = document.createElement('div');
  row.className = 'custom-row';

  const name = document.createElement('input');
  name.type = 'text';
  name.placeholder = '字段名（如 英语等级）';
  name.value = c.label || '';
  name.dataset.custom = 'label';

  const val = document.createElement('input');
  val.type = 'text';
  val.placeholder = '内容（如 CET-6 560）';
  val.value = c.value || '';
  val.dataset.custom = 'value';

  const del = document.createElement('button');
  del.className = 'icon-btn';
  del.textContent = '✕';
  del.title = '删除该字段';
  del.addEventListener('click', () => { row.remove(); scheduleSave(); });

  row.append(name, val, del);
  return row;
}

function buildCustoms() {
  const list = $('#customList');
  const customs = Array.isArray(profile.customs) ? profile.customs : [];
  if (!customs.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '还没有自定义字段。';
    list.appendChild(empty);
  }
  for (const c of customs) list.appendChild(customRow(c));
}

/* ---------- 学习记录 ---------- */

function buildLearned() {
  const list = $('#learnedList');
  list.innerHTML = '';
  const entries = Object.entries(learned)
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '暂无学习记录。在网申页手动填写过的字段会出现在这里。';
    list.appendChild(empty);
    return;
  }
  for (const pair of entries) {
    const e = pair[1];
    const row = document.createElement('div');
    row.className = 'kv-row';

    const lab = document.createElement('span');
    lab.className = 'kv-label';
    lab.textContent = e.label || pair[0];
    lab.title = e.label || pair[0];

    const arrow = document.createElement('span');
    arrow.className = 'kv-arrow';
    arrow.textContent = '→';

    const val = document.createElement('span');
    val.className = 'kv-value';
    val.textContent = e.value;
    val.title = e.value;

    const del = document.createElement('button');
    del.className = 'icon-btn';
    del.textContent = '✕';
    del.title = '删除该条学习记录';
    del.addEventListener('click', async () => {
      delete learned[pair[0]];
      await chrome.storage.local.set({ learned });
      row.remove();
      if (!Object.keys(learned).length) buildLearned();
      flashSaved('已删除');
    });

    row.append(lab, arrow, val, del);
    list.appendChild(row);
  }
}

/* ---------- 站点规则 ---------- */

async function detectHost() {
  const el = $('#siteHost');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) throw new Error('no tab');
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'PING' }, {frameId:0});
    if (!res || !res.ok || !res.host) throw new Error('no host');
    currentHost = res.host;
    el.textContent = '当前网站：' + currentHost;
    buildRules();
  } catch (e) {
    currentHost = '';
    el.textContent = '无法获取当前网站（浏览器内部页面）。请先打开一个普通网页再配置规则。';
  }
}

function ruleRow(rule) {
  rule = rule || {};
  const row = document.createElement('div');
  row.className = 'rule-row';

  const match = document.createElement('input');
  match.type = 'text';
  match.placeholder = '匹配词（标签文字或 name 属性）';
  match.value = rule.match || '';
  match.dataset.rule = 'match';

  const target = document.createElement('select');
  target.dataset.rule = 'target';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '选择资料字段';
  target.appendChild(empty);
  for (const pair of RULE_FIELDS) {
    const op = document.createElement('option');
    op.value = pair[0];
    op.textContent = pair[1];
    target.appendChild(op);
  }
  target.value = rule.target || '';

  const del = document.createElement('button');
  del.className = 'icon-btn';
  del.textContent = '✕';
  del.title = '删除该规则';
  del.addEventListener('click', () => { row.remove(); scheduleSave(); });

  row.append(match, target, del);
  return row;
}

function buildRules() {
  const list = $('#ruleList');
  list.innerHTML = '';
  if (!currentHost) return;
  const rules = Array.isArray(siteRules[currentHost]) ? siteRules[currentHost] : [];
  for (const r of rules) list.appendChild(ruleRow(r));
}

function buildSiteObservations(){
  const list=$('#siteObservationList');list.replaceChildren();
  const helper=globalThis.QIUZHAO_SITE_OBSERVATIONS;
  const entries=helper?helper.list(siteObservations):Object.entries(siteObservations).sort((a,b)=>(b[1]?.lastSeenAt||0)-(a[1]?.lastSeenAt||0));
  if(!entries.length){const hint=document.createElement('p');hint.className='hint';hint.textContent='尚未记录招聘网站。扫描或填写一次后会自动出现。';list.append(hint);return;}
  for(const [host,entry] of entries){
    const row=document.createElement('div');row.className='site-observation';
    const title=document.createElement('strong');title.textContent=host;
    const meta=document.createElement('span');const last=entry.lastRun||{};
    meta.textContent='扫描 '+(entry.scans||0)+' 次 · 填写 '+(entry.runs||0)+' 次'+(entry.runs?' · 已核验 '+(last.verified||0)+' 项':'');
    row.append(title,meta);list.append(row);
  }
}

/* ---------- PDF / Word / Excel / 文本资料 ---------- */

function setSourceStatus(text, state) {
  const el = $('#sourceStatus');
  el.textContent = text;
  el.dataset.state = state || 'info';
}

function renderSourceMaterial() {
  const hasSource = !!(sourceMaterial && sourceMaterial.text);
  $('#extractSourceAi').disabled = !hasSource;
  $('#clearSource').disabled = !hasSource;
  if (!hasSource) {
    setSourceStatus('尚未导入原始资料。', 'info');
    return;
  }
  const count = Number(sourceMaterial.characters || sourceMaterial.text.length || 0);
  const suffix = '，本地读取 ' + count + ' 个字符。更新资料需点击提取并核对变化。';
  setSourceStatus('已导入 ' + sourceMaterial.name + suffix, 'success');
}

async function readSourceFile(file) {
  if (!file) throw new Error('请选择资料文件');
  if (file.size > 20 * 1024 * 1024) throw new Error('资料文件不能超过 20MB');
  const name = String(file.name || '资料');
  const ext = (name.split('.').pop() || '').toLowerCase();
  let text = '';
  if (!['pdf','docx','xlsx','xls','csv','json','txt','md'].includes(ext)) throw new Error('暂不支持此格式，请选择 PDF、.docx、Excel 或文本文件');
  if (ext === 'pdf') {
    const { extractPdfText } = await import('../shared/pdf-import.js');
    text = (await extractPdfText(file)).text;
  } else if (ext === 'docx') {
    if (!globalThis.mammoth) throw new Error('Word 解析组件加载失败');
    const result = await globalThis.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    text = result && result.value || '';
  } else if (ext === 'xlsx' || ext === 'xls') {
    if (!globalThis.XLSX) throw new Error('Excel 解析组件加载失败');
    const workbook = globalThis.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const chunks = [];
    for (const sheetName of workbook.SheetNames.slice(0, 30)) {
      chunks.push('工作表：' + sheetName);
      const rows = globalThis.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
      for (const row of rows.slice(0, 5000)) chunks.push(row.map(cell => String(cell || '').trim()).join('\t'));
    }
    text = chunks.join('\n');
  } else {
    text = await file.text();
  }
  text = String(text || '').replace(/\u0000/g, '').trim();
  if (!text) throw new Error('文件中没有可读取的文本或表格内容');
  if (text.length > 300000) throw new Error('文本超过 30 万字，请精简后重新导入');
  return { name, type: ext || file.type || 'text', text, characters: text.length, importedAt: Date.now() };
}

async function importSourceMaterial(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;
  setSourceStatus('正在本地读取资料…', 'loading');
  try {
    const nextSource = await readSourceFile(file);
    await chrome.storage.local.set({ sourceMaterial: nextSource });
    sourceMaterial = nextSource;
    renderSourceMaterial();
    setSourceStatus('文件已在本地读取。点击 AI 提取并预览后再选择需要更新的资料。', 'success');
  } catch (error) {
    setSourceStatus(String(error && error.message || '资料读取失败'), 'error');
  }
}

async function extractSourceWithAi() {
  if (!sourceMaterial || !sourceMaterial.text || sourceBusy) return;
  if(pendingUpdate){workflowStatus('请先应用或放弃待核对的更新，再提取新资料。',true);return;}
  sourceBusy=true;$('#sourceFileBtn').disabled=true;$('#clearSource').disabled=true;
  const button = $('#extractSourceAi');
  button.disabled = true;
  button.textContent = '提取中…';
  setSourceStatus('正在让所选模型提取结构化资料…', 'loading');
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_EXTRACT_PROFILE',
      payload: { name: sourceMaterial.name, type: sourceMaterial.type, text: sourceMaterial.text },
    });
    if (!response || !response.ok) throw new Error(response && response.error || 'AI 提取失败');
    await stageProfileUpdate(response.profile || {}, '从 '+sourceMaterial.name+' 更新');
    setSourceStatus('提取完成，请在下方核对变化。原资料尚未改变。', 'success');
  } catch (error) {
    setSourceStatus(String(error && error.message || 'AI 提取失败'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'AI 提取并预览';
    sourceBusy=false;$('#sourceFileBtn').disabled=false;$('#clearSource').disabled=false;
  }
}

async function clearSourceMaterial() {
  sourceMaterial = null;
  await chrome.storage.local.remove('sourceMaterial');
  renderSourceMaterial();
}

/* ---------- 数据读写 ---------- */

function collect() {
  document.querySelectorAll('[data-key]').forEach(el => {
    if(el.value!==el.dataset.originalText || typeof profile[el.dataset.key]==='string' || profile[el.dataset.key]==null)profile[el.dataset.key] = el.value.trim();
  });
  const rows = Array.from(document.querySelectorAll('.custom-row'));
  profile.customs = rows
    .map(r => ({
      label: r.querySelector('[data-custom="label"]').value.trim(),
      value: r.querySelector('[data-custom="value"]').value.trim(),
    }))
    .filter(c => c.label && c.value);

  if (currentHost) {
    const ruleRows = Array.from(document.querySelectorAll('.rule-row'));
    const rules = ruleRows
      .map(r => ({
        match: r.querySelector('[data-rule="match"]').value.trim(),
        target: r.querySelector('[data-rule="target"]').value,
      }))
      .filter(r => r.match && r.target);
    if (rules.length) siteRules[currentHost] = rules;
    else delete siteRules[currentHost];
  }
}

function scheduleSave() {
  persistProfileEdits().catch(saveError);
}

function flashSaved(text) {
  const el = $('#saveStatus');
  el.textContent = text;
}

/* ---------- 事件绑定 ---------- */

function bind() {
  $('#autoFill').checked = !!settings.autoFill;
  $('#overwrite').checked = false;
  if(settings.overwrite){settings.overwrite=false;chrome.storage.local.set({settings}).catch(()=>{});}
  buildProviderSelect();
  renderAiProvider();

  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    selectProfileTab(btn.dataset.tab);
  });

  $('#main').addEventListener('input', e => {
    if (e.target.matches('[data-key],[data-custom],[data-rule]')) scheduleSave();
  });
  $('#main').addEventListener('change', e => {
    if (e.target.matches('[data-key],[data-custom],[data-rule]')) scheduleSave();
  });

  $('#autoFill').addEventListener('change', async (e) => {
    settings.autoFill = e.target.checked;
    await chrome.storage.local.set({ settings });
    flashSaved('设置已保存 ✓');
  });
  $('#overwrite').addEventListener('change', async (e) => {
    settings.overwrite = false;
    await chrome.storage.local.set({ settings });
    flashSaved('设置已保存 ✓');
  });

  $('#addCustom').addEventListener('click', () => {
    const hint = $('#customList .hint');
    if (hint) hint.remove();
    $('#customList').appendChild(customRow());
  });

  $('#addRule').addEventListener('click', () => {
    if (!currentHost) return;
    $('#ruleList').appendChild(ruleRow());
  });

  $('#clearLearned').addEventListener('click', async () => {
    if (!Object.keys(learned).length) return;
    if (!confirm('清空全部学习记录？此操作不可恢复。')) return;
    learned = {};
    await chrome.storage.local.set({ learned });
    buildLearned();
    flashSaved('已清空');
  });
  $('#clearSiteObservations').addEventListener('click', async () => {
    if(!Object.keys(siteObservations).length)return;
    if(!confirm('清空所有站点记录？这不会删除个人资料或站点规则。'))return;
    siteObservations={};await chrome.storage.local.set({siteObservations});buildSiteObservations();flashSaved('站点记录已清空');
  });

  $('#aiProvider').addEventListener('change', changeAiProvider);
  $('#connectAi').addEventListener('click', connectAiProvider);
  $('#aiModel').addEventListener('change', saveAiModel);
  $('#aiEnabled').addEventListener('change', toggleAiEnabled);
  $('#clearAiKey').addEventListener('click', clearAiKey);
  $('#sourceFileBtn').addEventListener('click', () => $('#sourceFile').click());
  $('#sourceFile').addEventListener('change', importSourceMaterial);
  $('#extractSourceAi').addEventListener('click', extractSourceWithAi);
  $('#clearSource').addEventListener('click', clearSourceMaterial);

  $('#fillBtn').addEventListener('click', () => fillCurrentTab(false));
  $('#selfCheckBtn').addEventListener('click', () => fillCurrentTab(true));
  $('#lastCheckBtn').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      const response = await withUiTimeout(chrome.tabs.sendMessage(tab.id,{type:'GET_SELF_CHECK'},{frameId:0}),3000);
      if (!response.report) {showResult('本页暂无自检，请先点击填写并自检。',false);return;}
      renderSelfCheck(response.report,tab.id);
    } catch {showResult('自检记录不可用，请刷新页面后重新自检。',true);}
  });
  $('#stopFillBtn').addEventListener('click', stopCurrentFill);
  $('#runLogsBtn').addEventListener('click', showRunLogs);
  $('#demoBtn').addEventListener('click', loadDemoProfile);
  $('#exportBtn').addEventListener('click', exportData);
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', importData);
  $('#clearBtn').addEventListener('click', clearData);
}

async function loadDemoProfile() {
  try{await stageProfileUpdate(DEMO_PROFILE,'演示资料');}
  catch(error){workflowStatus(error.message,true);}
}

function aiPermissionPattern(endpoint) {
  let url;
  try { url = new URL(endpoint); } catch (error) { throw new Error('接口地址格式不正确'); }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('接口必须使用 HTTPS，本机接口可使用 HTTP');
  }
  if (url.username || url.password) throw new Error('接口地址不能包含账号或密码');
  return url.protocol + '//' + url.hostname + '/*';
}

function providerById(id) {
  return AI_PROVIDERS.find(provider => provider.id === id) || AI_PROVIDERS[0];
}

function buildProviderSelect() {
  const select = $('#aiProvider');
  select.innerHTML = '';
  for (const provider of AI_PROVIDERS) {
    const option = document.createElement('option');
    option.value = provider.id;
    option.textContent = provider.name;
    select.appendChild(option);
  }
}

function providerKey(providerId) {
  const keys = aiSecrets.keys && typeof aiSecrets.keys === 'object' ? aiSecrets.keys : {};
  return String(keys[providerId] || '').trim();
}

function normalizeApiKeyInput(raw) {
  let value = String(raw || '').trim().replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
  if (!value) return '';
  value = value.replace(/^(?:authorization\s*:\s*)?bearer\s+/i, '').trim();
  value = value.replace(/^["'`]+|["'`]+$/g, '').trim();
  if (/^[\x21-\x7E]{8,}$/.test(value)) return value;
  const candidates = value.match(/[A-Za-z0-9][A-Za-z0-9._~+\/=\-]{15,}/g) || [];
  candidates.sort((a, b) => b.length - a.length);
  if (candidates[0]) return candidates[0];
  throw new Error('API 密钥格式不正确，请只粘贴密钥本身');
}

function providerEndpoints(providerId) {
  const provider = providerById(providerId);
  if (providerId === 'custom') {
    return [$('#aiEndpoint').value.trim(), $('#aiModelsEndpoint').value.trim()].filter(Boolean);
  }
  return [provider.chatEndpoint, provider.modelsEndpoint].filter(Boolean);
}

function providerPermissionPatterns(providerId) {
  return Array.from(new Set(providerEndpoints(providerId).map(aiPermissionPattern)));
}

async function requestProviderPermissions(providerId) {
  if (providerId !== 'custom') return;
  const origins = providerPermissionPatterns(providerId);
  if (!origins.length) throw new Error('接口地址尚未配置');
  const granted = await chrome.permissions.request({ origins });
  if (!granted) throw new Error('未获得该 AI 厂商的访问权限');
}

async function removeProviderPermissions(providerId) {
  if (providerId !== 'custom') return;
  try {
    const origins = providerPermissionPatterns(providerId);
    if (origins.length) await chrome.permissions.remove({ origins });
  } catch (error) { /* ignore */ }
}

function cachedProviderModels(providerId) {
  const cache = settings.aiProviderModels && settings.aiProviderModels[providerId];
  return Array.isArray(cache) ? cache : [];
}

function selectedProviderModel(providerId) {
  const selections = settings.aiProviderSelections || {};
  return selections[providerId] || (settings.aiProvider === providerId ? settings.aiModel : '') || '';
}

function preferredProviderModel(providerId, models) {
  const provider = providerById(providerId);
  const prefixes = Array.isArray(provider.preferredModelPrefixes) ? provider.preferredModelPrefixes : [];
  for (const prefix of prefixes) {
    const exact = models.find(model => model.id.toLowerCase() === prefix.toLowerCase());
    if (exact) return exact.id;
    const match = models.find(model => model.id.toLowerCase().startsWith(prefix.toLowerCase()));
    if (match) return match.id;
  }
  return models[0] ? models[0].id : '';
}

function renderModelOptions(providerId) {
  const select = $('#aiModel');
  const models = cachedProviderModels(providerId);
  const selected = selectedProviderModel(providerId);
  select.innerHTML = '';
  if (!models.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '请先连接并获取模型';
    select.appendChild(option);
    select.disabled = true;
    return;
  }
  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.id;
    option.textContent = model.name && model.name !== model.id ? model.name + '  ' + model.id : model.id;
    select.appendChild(option);
  }
  select.disabled = false;
  select.value = models.some(model => model.id === selected) ? selected : models[0].id;
}

function renderAiProvider() {
  const providerId = settings.aiProvider || 'openai';
  $('#aiProvider').value = providerId;
  $('#aiEnabled').checked = !!settings.aiEnabled;
  $('#customAiFields').hidden = providerId !== 'custom';
  $('#aiProtocol').value = settings.aiProtocol || 'chat-completions';
  $('#aiEndpoint').value = settings.aiEndpoint || '';
  $('#aiModelsEndpoint').value = settings.aiModelsEndpoint || '';
  $('#aiApiKey').value = '';
  $('#aiApiKey').placeholder = providerKey(providerId) ? '密钥已保存，留空会保留' : '粘贴厂商 API 密钥';
  renderModelOptions(providerId);
  setAiStatus(settings.aiEnabled ? 'AI 补填已启用' : '粘贴密钥并获取模型后即可启用', settings.aiEnabled ? 'success' : 'info');
}

function setAiStatus(message, state) {
  const status = $('#aiStatus');
  status.textContent = message;
  status.dataset.state = state || 'info';
}

function saveCustomAiFields() {
  settings.aiProtocol = $('#aiProtocol').value;
  settings.aiEndpoint = $('#aiEndpoint').value.trim();
  settings.aiModelsEndpoint = $('#aiModelsEndpoint').value.trim();
}

async function changeAiProvider() {
  const oldProvider = settings.aiProvider || 'openai';
  const newProvider = $('#aiProvider').value;
  if (oldProvider === 'custom') saveCustomAiFields();
  settings.aiProviderSelections = Object.assign({}, settings.aiProviderSelections, {
    [oldProvider]: $('#aiModel').value || settings.aiModel || '',
  });
  settings.aiProvider = newProvider;
  settings.aiModel = settings.aiProviderSelections[newProvider] || '';
  settings.aiEnabled = false;
  await chrome.storage.local.set({ settings });
  await removeProviderPermissions(oldProvider);
  renderAiProvider();
}

async function connectAiProvider() {
  const providerId = $('#aiProvider').value;
  const rawApiKey = $('#aiApiKey').value;
  const button = $('#connectAi');
  if (providerId === 'custom') saveCustomAiFields();
  aiSecrets.keys = Object.assign({}, aiSecrets.keys || {});

  button.disabled = true;
  button.textContent = '正在获取模型…';
  setAiStatus('正在验证密钥并读取模型列表，请稍候…', 'loading');
  try {
    const apiKey = normalizeApiKeyInput(rawApiKey);
    if (apiKey) {
      aiSecrets.keys[providerId] = apiKey;
      $('#aiApiKey').value = '';
    }
    if (providerId !== 'custom' && !providerKey(providerId)) throw new Error('请粘贴 API 密钥');
    await requestProviderPermissions(providerId);
    settings.aiProvider = providerId;
    await chrome.storage.local.set({ settings, aiSecrets });
    const response = await chrome.runtime.sendMessage({ type: 'AI_LIST_MODELS', providerId });
    if (!response || !response.ok) throw new Error(response && response.error || '获取模型失败');
    const models = Array.isArray(response.models) ? response.models : [];
    if (!models.length) throw new Error('没有获取到可用文本模型');
    settings.aiProviderModels = Object.assign({}, settings.aiProviderModels, { [providerId]: models });
    const previous = selectedProviderModel(providerId);
    settings.aiModel = models.some(model => model.id === previous)
      ? previous
      : preferredProviderModel(providerId, models);
    settings.aiProviderSelections = Object.assign({}, settings.aiProviderSelections, { [providerId]: settings.aiModel });
    settings.aiEnabled = true;
    await chrome.storage.local.set({ settings, aiSecrets });
    renderAiProvider();
    setAiStatus(response.warning || ('连接成功，已获取 ' + models.length + ' 个模型'), 'success');
    flashSaved('AI 已连接 ✓');
  } catch (error) {
    settings.aiEnabled = false;
    $('#aiEnabled').checked = false;
    await chrome.storage.local.set({ settings, aiSecrets });
    setAiStatus(String(error && error.message || '连接失败'), 'error');
  } finally {
    button.disabled = false;
    button.textContent = '连接并获取模型';
  }
}

async function saveAiModel() {
  const providerId = $('#aiProvider').value;
  settings.aiModel = $('#aiModel').value;
  settings.aiProviderSelections = Object.assign({}, settings.aiProviderSelections, { [providerId]: settings.aiModel });
  await chrome.storage.local.set({ settings });
  flashSaved('模型已保存 ✓');
}

async function toggleAiEnabled() {
  const enabled = $('#aiEnabled').checked;
  const providerId = $('#aiProvider').value;
  try {
    if (enabled) {
      if (!$('#aiModel').value) throw new Error('请先获取并选择模型');
      if (providerId !== 'custom' && !providerKey(providerId)) throw new Error('请先粘贴 API 密钥');
      if (providerId === 'custom') saveCustomAiFields();
      await requestProviderPermissions(providerId);
      settings.aiModel = $('#aiModel').value;
    } else {
      await removeProviderPermissions(providerId);
    }
    settings.aiEnabled = enabled;
    await chrome.storage.local.set({ settings });
    setAiStatus(enabled ? 'AI 补填已启用' : 'AI 补填已关闭', enabled ? 'success' : 'info');
  } catch (error) {
    $('#aiEnabled').checked = false;
    settings.aiEnabled = false;
    await chrome.storage.local.set({ settings });
    setAiStatus(String(error && error.message || '设置失败'), 'error');
  }
}

async function clearAiKey() {
  const providerId = $('#aiProvider').value;
  aiSecrets.keys = Object.assign({}, aiSecrets.keys || {});
  delete aiSecrets.keys[providerId];
  settings.aiEnabled = false;
  $('#aiApiKey').value = '';
  $('#aiApiKey').placeholder = '粘贴厂商 API 密钥';
  $('#aiEnabled').checked = false;
  await chrome.storage.local.set({ aiSecrets, settings });
  await removeProviderPermissions(providerId);
  setAiStatus('密钥已清除', 'info');
  flashSaved('密钥已清除');
}

/* ---------- 填充当前页 ---------- */

function showResult(text, isError, report) {
  const el = $('#fillResult');
  el.hidden = false;
  el.replaceChildren();
  const issues = report && ((report.failed || []).length || (report.remaining || []).length || (report.unmatched || []).length || (report.aiNote && !['ok','nothing-to-map'].includes(report.aiNote)));
  el.className = 'result ' + (isError ? 'err' : issues ? 'partial' : 'ok');
  const title = document.createElement('div');
  title.className = 'result-title';
  title.textContent = report ? (issues ? '填写结束，仍有项目待处理' : '填写结束') : (text.length > 100 ? '页面分析完成' : text);
  el.append(title);
  if (report) {
    const metrics = document.createElement('div'); metrics.className = 'result-metrics';
    for (const [label,value] of [['本次验证', (report.filled || []).length],['当前非空',report.pageFilledCount],['当前空白',report.pageEmptyCount]]) {
      if (!Number.isFinite(value)) continue;
      const item = document.createElement('div'), count = document.createElement('strong'), caption = document.createElement('span');
      count.textContent = String(value); caption.textContent = label; item.append(count,caption); metrics.append(item);
    }
    el.append(metrics);
    const note = document.createElement('p'); note.className = 'result-note';
    note.textContent = '非空不代表校验通过；网站暂存尚未验证。'; el.append(note);
  }
  if (report || text.length > 100) {
    const details = document.createElement('details'), heading = document.createElement('summary'), list = document.createElement('ul');
    heading.textContent = '查看未完成项与诊断'; list.className = 'result-details';
    for (const line of text.split('；').filter(Boolean)) {const item=document.createElement('li'); item.textContent=line;list.append(item);}
    details.append(heading,list);el.append(details);
  }
}

let fillSession = null;

async function showRunLogs(){
  const root=$('#runLogsResult');root.hidden=false;root.replaceChildren();
  try{
    const stored=await chrome.storage.local.get('runLogs');
    const logs=Array.isArray(stored.runLogs)?stored.runLogs:[];
    const note=document.createElement('p');note.textContent='本地自动保留最近 30 次填写（含失败、停止及有操作的自动填充）。不保存资料值、密钥、页面正文或完整网址。当前 '+logs.length+' 次。';root.append(note);
    for(const log of logs){
      const details=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('pre');
      title.textContent=log.at+' · '+log.host+' · v'+log.version+' · '+(log.outcome==='running'?'未完成（进度快照）':log.outcome)+' · '+(log.verification==='final'?'最终验证 ':'阶段计数 ')+log.counts.verified+' / 空白 '+log.counts.empty;
      body.style.whiteSpace='pre-wrap';body.style.overflowWrap='anywhere';
      body.textContent=JSON.stringify({contentBuild:log.contentBuild,trigger:log.trigger,verification:log.verification,useAI:log.useAI,durationMs:log.durationMs,droppedEvents:log.droppedEvents,events:log.events,repeats:log.repeats,items:log.items,diagnostics:log.diagnostics},null,2);
      details.append(title,body);root.append(details);
    }
    const download=document.createElement('button');download.type='button';download.textContent='导出运行日志';download.disabled=!logs.length;
    download.onclick=()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify({schema:1,logs},null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='qiuzhao-run-logs-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };root.append(download);
    if (globalThis.QIUZHAO_FEEDBACK) {
      const analysis = globalThis.QIUZHAO_FEEDBACK.analyze({logs});
      const heading = document.createElement('strong');heading.textContent='填写问题分析';root.append(heading);
      const summary = document.createElement('p');
      summary.textContent=analysis.issues.length+' 类观察项，'+analysis.incompleteRuns+' 次运行缺少完整终验。相似问题合并展示，未再次出现不代表已修复。';root.append(summary);
      const list=document.createElement('ul');
      for(const issue of analysis.issues){
        const item=document.createElement('li');
        item.textContent=issue.host+' · '+issue.fieldKey+' · '+issue.title+'（'+issue.reason+'），出现于 '+issue.affectedRuns+' 次运行。'+issue.nextStep;
        list.append(item);
      }
      root.append(list);
      const exportIssues=document.createElement('button');exportIssues.type='button';exportIssues.textContent='导出问题分析';exportIssues.disabled=!logs.length;
      exportIssues.onclick=()=>{
        const url=URL.createObjectURL(new Blob([JSON.stringify(analysis,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='qiuzhao-feedback-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      };root.append(exportIssues);
    }
  }catch(error){root.textContent='日志读取失败，请重新打开插件重试。';}
}

function withUiTimeout(promise, ms) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('fill-response-timeout')), ms);
  })]).finally(() => clearTimeout(timer));
}

async function stopCurrentFill() {
  if (!fillSession) return;
  fillSession.stopped = true;
  $('#fillProgress').textContent = '正在停止，已填内容保留';
  try {
    await withUiTimeout(chrome.tabs.sendMessage(fillSession.tabId, {type:'STOP_FILL'},{frameId:0}), 3000);
  } catch (error) {
    $('#fillProgress').textContent = '未能确认停止，请刷新表单终止旧任务';
  }
}

function renderSelfCheck(report, tabId) {
  const root = $('#selfCheckResult');root.hidden=false;root.replaceChildren();
  const names={failed:'填写失败',missing:'补充资料',empty:'空白待判断',existing:'已有内容待核对',recheck:'重新核对',verified:'已验证'};
  const reasons={
    'repeat-section-unobserved':'区块未识别，可能尚未展开或当前页面不提供。请按区块核对。',
    'empty-after-fill':'回读仍为空，不能算成功。请核对控件是否真正提交了选项。',
    'target-mismatch':'最终值与资料目标不符，请定位核对。',
    'choice-layer-close-blocked':'前一弹层未关闭，此控件暂未填写。请核对弹层状态。',
    'no-visible-options':'未取得可见候选项。请定位到网页，检查下拉框是否加载或需要输入搜索词。',
    'no-matching-options':'没有可匹配的选项。请核对资料与网站选项，必要时在网页手动选择。',
    'ambiguous-options':'候选项有歧义。请在网页选择准确项，不要反复整页重填。',
    'stable-match':'本轮落值稳定，通过已识别校验；仍需在网站自行保存。',
    'control-replaced':'页面重绘或控件隐藏。请回到对应区块核对，旧定位可能失效。',
    'validation-rejected':'网站校验未通过。请检查该字段的格式和页面错误提示。',
    'not-verified':'本轮未确认填写成功。请定位到网页核对实际内容。',
    'value-reverted':'填写后内容回退或变化。请定位到网页重新确认。',
    'missing-source':'已识别到需要的资料缺失。请先在“我的简历”补充，再填写剩余空项。',
    'existing-unverified':'网页已有内容，插件已保留。请核对现有值，无需因为此提示重新补资料。',
    'unmapped-or-empty':'字段为空，尚不能确定是否缺资料，也可能尚未适配。请定位查看；网站要求填写时按实际情况补充。',
    'date-range-unsupported':'日期范围未能自动填写，请在网页手动选择起止日期。',
  };
  function category(item) {
    if(item.status==='verified')return 'verified';
    if(item.status==='failed')return 'failed';
    if(item.status==='missing')return 'missing';
    if(item.reason==='existing-unverified')return 'existing';
    if(item.reason==='unmapped-or-empty')return 'empty';
    return 'recheck';
  }
  const advice=item=>reasons[item.reason]||'原因尚未明确。请定位核对；如仍有问题，导出诊断供进一步分析。';
  const items=Array.isArray(report.items)?report.items:[];
  const groups=Object.fromEntries(Object.keys(names).map(key=>[key,items.filter(item=>category(item)===key)]));
  const actionCounts=Object.fromEntries(Object.entries(groups).map(([key,rows])=>[key,rows.length]));
  const title=document.createElement('strong');
  title.textContent=Object.entries(names).map(([key,name])=>name+' '+actionCounts[key]).join(' · ');root.append(title);
  const note=document.createElement('p');
  note.textContent='仅检查当前表单框架；“补充资料 0”不代表资料齐全。网站保存未验证。点击字段可定位，刷新页面后旧记录失效。';root.append(note);
  for(const [key,rows] of Object.entries(groups)) {
    if(!rows.length)continue;
    const details=document.createElement('details'),heading=document.createElement('summary'),list=document.createElement('ul');
    details.dataset.category=key;details.open=!['verified','existing'].includes(key);
    heading.textContent=names[key]+' '+rows.length;list.className='result-details';
    details.append(heading);
    if(key==='missing'){
      const edit=document.createElement('button');edit.type='button';edit.textContent='去补充简历资料';
      edit.onclick=()=>selectProfileTab('resume');details.append(edit);
    }
    for(const item of rows){
      const row=document.createElement('li'),button=document.createElement('button'),explanation=document.createElement('p');
      button.type='button';button.className='self-check-target';button.textContent='定位 '+item.id+' '+(item.label||'未命名字段');
      explanation.className='self-check-advice';explanation.textContent=advice(item);
      button.onclick=async()=>{try{const result=await chrome.tabs.sendMessage(tabId,{type:'LOCATE_SELF_CHECK',id:item.id},{frameId:0});if(result.ok)window.close();else explanation.textContent='字段已变化，定位失效。请回到网页核对，必要时重新自检。';}catch{explanation.textContent='页面已刷新或连接失效，请回到网页核对。';}};
      row.append(button,explanation);list.append(row);
    }
    details.append(list);root.append(details);
  }
  const exportBtn=document.createElement('button');exportBtn.type='button';exportBtn.textContent='导出脱敏诊断';
  exportBtn.onclick=()=>{
    // Only built-in field keys and fixed guidance are added; no page labels or values.
    const knownKeys=new Set(typeof FIELD_TABS==='undefined'?[]:FIELD_TABS.flatMap(t=>t.fields).filter(f=>f.key).map(f=>f.key));
    const safe={schemaVersion:2,at:report.at,scope:report.scope,persistence:report.persistence,validation:report.validation,counts:report.counts,actionCounts,openLayers:report.openLayers,items:items.map(item=>({id:item.id,status:item.status,reason:item.reason,fieldKey:knownKeys.has(item.fieldKey)?item.fieldKey:'unmapped',category:category(item),nextStep:advice(item)}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(safe,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='autofill-self-check.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };root.append(exportBtn);
}

async function fillCurrentTab(selfCheck) {
  selfCheck = selfCheck === true;
  try{await persistProfileEdits();}catch(error){saveError(error);showResult('资料尚未保存，请先处理保存提示。',true);return;}
  if(!Object.values(profile).some(v=>!UPDATES.empty(v))){selectProfileTab('resume');workflowStatus('请先填写资料或导入简历。');return;}
  const btn = $('#fillBtn');
  btn.disabled = true;
  $('#selfCheckBtn').disabled = true;
  $('#selfCheckResult').hidden = true;
  btn.textContent = '填充中…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id == null) { showResult('未找到当前标签页', true); return; }
    const runtime=await withUiTimeout(chrome.tabs.sendMessage(tab.id,{type:'PING'},{frameId:0}),3000);
    if(!runtime || runtime.contentBuild!=='1.16.3-dev'){
      showResult('页面仍在使用旧版脚本。请先重新加载扩展，再刷新招聘页面后重试；本次未开始填写。',true);return;
    }
    fillSession = {tabId:tab.id, stopped:false, timer:null, polling:false};
    $('#stopFillBtn').hidden = false;
    $('#fillProgress').textContent = '正在分析页面';
    const overview = await withUiTimeout(chrome.tabs.sendMessage(tab.id, { type: 'SCAN_FORM', useAI: false },{frameId:0}), 45000);
    if (fillSession.stopped) {showResult('已停止，未启动填写。', false); return;}
    if (overview && overview.note === 'sensitive-page') {
      showResult('已跳过：该页面包含密码输入框，插件不会扫描或填写登录页面。', true);
      return;
    }
    let overviewText = overview && Number.isFinite(overview.totalControls)
      ? '页面总览：共 ' + overview.totalControls + ' 个字段，规则可填 ' + overview.ruleCandidates + ' 个，AI 待判断 ' + overview.aiCandidates + ' 个'
      : '页面总览完成';
    if (overview && overview.aiUsed) {
      overviewText += '；模型复核：识别 ' + overview.aiRecognized + ' 个，需判断 ' + overview.aiAmbiguous + ' 个';
    } else if (settings.aiEnabled && overview && overview.aiNote) {
      overviewText += '；模型总览：' + overview.aiNote;
    }
    const repeatPlan = Array.isArray(overview && overview.repeatSections)
      ? overview.repeatSections.filter(item => item.records > 1).map(item => item.label + ' ' + item.records + ' 条').join('、')
      : '';
    showResult(overviewText + (repeatPlan ? '；多条资料：' + repeatPlan : ''), false);
    btn.textContent = settings.aiEnabled?'正在规划并填写…':'正在按规则填写…';
    const session = fillSession;
    session.timer = setInterval(async () => {
      if (session.polling || session !== fillSession) return;
      session.polling = true;
      try {
        const status = await withUiTimeout(chrome.tabs.sendMessage(tab.id, {type:'GET_FILL_STATUS'},{frameId:0}), 2000);
        if (session === fillSession && status && status.running && !session.stopped) {
          $('#fillProgress').textContent = status.phase === 'filling'
            ? '进度 ' + status.completed + '/' + status.total + '，当前：' + status.field
            : status.phase === 'self-check' ? '正在复检落值与页面校验' : status.phase === 'ai-mapping' ? '正在等待 AI 映射' : '正在准备填写';
        }
      } catch (error) { /* main response has a separate deadline */ }
      finally { session.polling = false; }
    }, 800);
    const overwriteThisRun = $('#overwrite').checked;
    $('#overwrite').checked = false;
    const res = await withUiTimeout(chrome.tabs.sendMessage(tab.id, {
      type: 'FILL_FORM',
      overwrite: overwriteThisRun,
      useAI: !!settings.aiEnabled,
      selfCheck,
    },{frameId:0}), 190000);
    if (res && ['fill-cancelled','fill-timeout','fill-error'].includes(res.note)) {
      const label = res.note === 'fill-cancelled' ? '已停止' : res.note === 'fill-timeout' ? '填写超时，已退出' : '填写异常，已退出';
      showResult(label + '；此前完成 ' + (res.filled || []).length + ' 项，剩余字段尚未完成；网站暂存未验证。', true);
      return;
    }
    if (res && res.note === 'sensitive-page') {
      showResult('已跳过：该页面包含密码输入框（疑似登录页），为安全起见不自动填充。', true);
      return;
    }
    const filled = Array.from(new Set(res && res.filled || []));
    const filledCount = Array.isArray(res && res.filled) ? res.filled.length : 0;
    const aiFilledCount = Array.isArray(res && res.aiFilled) ? res.aiFilled.length : 0;
    const failed = Array.from(new Set(res && res.failed || []));
    const skipped = (res && res.skipped) || 0;
    const missingData = Array.from(new Set(res && res.missingData || []));
    const remaining = Array.from(new Set(res && res.remaining || []));
    const unmatched = Array.from(new Set(res && res.unmatched || []));
    const aiFilled = Array.from(new Set(res && res.aiFilled || []));
    if (!filled.length && !skipped && !failed.length && !missingData.length && !remaining.length && !unmatched.length) {
      showResult('未识别到可填写的字段。若表单在 iframe 内，请在表单区域内点击右键选择「填充网申表单」。', true);
      return;
    }
    const parts = [];
    if (Number.isFinite(res && res.pageFilledCount)) parts.push('当前页面已填写 ' + res.pageFilledCount + ' 个字段，空白 ' + res.pageEmptyCount + ' 个');
    parts.push(overviewText);
    if(res && res.pagePlan) {
      const decisions=res.pagePlan.controls||[],sections=res.pagePlan.sections||[];
      parts.push('执行计划：字段映射 '+decisions.filter(d=>d.status==='mapped').length+' 项，待核对 '+decisions.filter(d=>d.status==='review').length+' 项；区块分类 '+sections.filter(d=>d.status==='classified').length+' 项，未分类 '+sections.filter(d=>d.status!=='classified').length+' 项。范围限可见字段及可绑定添加入口的区块');
    }
    const repeated = Array.isArray(res && res.repeatSections) ? res.repeatSections : [];
    const repeatedText = repeated.filter(item => item.requested > 1)
      .map(item => item.label + ' ' + item.after + '/' + item.requested + ' 条')
      .join('、');
    if (repeatedText) parts.push('重复区块：' + repeatedText);
    if (filled.length) {
      const shown = filled.slice(0, 6).join('、');
      parts.push('本次已填 ' + filledCount + ' 个字段（' + shown + (filled.length > 6 ? '…' : '') + '）');
    }
    if (skipped) parts.push('跳过非空 ' + skipped + ' 项');
    if (failed.length) parts.push('未完成：' + failed.join('、'));
    const diagnostics = Array.isArray(res && res.diagnostics) ? res.diagnostics : [];
    const reasonLabels = {
      'selection-not-committed': '选项未成功落值或内容写入失败',
      'control-replaced': '页面重绘后需重新定位',
      'validation-rejected': '网站字段校验未通过',
      'value-reverted': '内容被回退或截断',
      'execution-error': '控件执行异常',
      'record-container-unresolved': '无法确定经历所在区块',
      'record-field-ambiguous': '同一经历存在多个同名字段',
      'record-field-missing': '该条经历缺少对应控件'
      ,'choice-open-failed': '下拉未打开或前一个弹层未关闭'
      ,'choice-layer-unresolved': '无法确定下拉弹层归属'
      ,'no-visible-options': '未取得候选项，需核对搜索词或加载状态'
      ,'no-matching-options': '资料与网站候选项不匹配'
      ,'ambiguous-options': '候选项有歧义，需准确名称或人工选择'
      ,'choice-option-unavailable': '候选未加载、无匹配或存在歧义'
      ,'choice-not-committed': '已点击候选，但选择或确认未落值'
    };
    const reasons = Array.from(new Set(diagnostics.filter(item => item.status === 'failed').map(item => reasonLabels[item.reason] || '待检查')));
    if (reasons.length) parts.push('原因：' + reasons.join('、'));
    if(res.logSaved===true)parts.push('本次诊断日志已自动保存，可在“运行日志”查看或导出');
    if(res.logSaved===false)parts.push('本次诊断日志保存失败');
    parts.push('以上为页面填值结果，网站暂存尚未验证');
    if (aiFilled.length) parts.push('其中 AI 补填 ' + aiFilledCount + ' 个字段');
    if (res.aiAdaptationRequests) parts.push('AI 交互适配调用 ' + res.aiAdaptationRequests + ' 次（次数不代表成功数）');
    if (missingData.length) parts.push('资料未填写：' + missingData.slice(0, 6).join('、') + (missingData.length > 6 ? '…' : ''));
    if (remaining.length) parts.push('仍为空：' + remaining.slice(0, 6).join('、') + (remaining.length > 6 ? '…' : ''));
    if (unmatched.length) parts.push('尚未支持：' + unmatched.slice(0, 6).join('、') + (unmatched.length > 6 ? '…' : ''));
    if (settings.aiEnabled && res && res.aiNote && !['ok', 'nothing-to-map'].includes(res.aiNote)) {
      parts.push('AI：' + res.aiNote);
    }
    showResult(parts.join('；'), !filled.length, res);
    if (res.selfCheck) renderSelfCheck(res.selfCheck,tab.id);
  } catch (err) {
    if (err.message === 'fill-response-timeout') {
      await stopCurrentFill();
      showResult('等待结果超时，已请求停止。若页面仍在变化，请刷新表单终止旧任务后重试。', true);
    } else showResult('此页面暂不可用：请刷新页面后重试（浏览器内部页面不支持）。', true);
  } finally {
    if (fillSession) clearInterval(fillSession.timer);
    fillSession = null;
    $('#stopFillBtn').hidden = true;
    $('#fillProgress').textContent = '';
    btn.disabled = false;
    $('#selfCheckBtn').disabled = false;
    btn.textContent = '快速填充';
  }
}

/* ---------- 备份：导出 / 导入 / 清空 ---------- */

async function exportData() {
  try{await persistProfileEdits();}catch(error){saveError(error);return;}
  const store = await chrome.storage.local.get(['learned', 'siteObservations']);
  const exportedSettings = Object.assign({}, settings);
  delete exportedSettings.aiProviderModels;
  const payload = {
    app: 'qiuzhao-autofill',
    version: 5,
    exportedAt: new Date().toISOString(),
    profile,
    settings: exportedSettings,
    learned: store.learned || {},
    siteRules,
    siteObservations: store.siteObservations || {},
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = 'qiuzhao-autofill-backup-' + d + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function importData(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if(file.size>5*1024*1024)throw Error('资料 JSON 不能超过 5MB');
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !Object.hasOwn(data,'profile') || (data.app && data.app!=='qiuzhao-autofill')) throw Error('请选择包含 profile 的本插件资料 JSON 或备份');
    if (data.kind==='structured-profile' && data.schemaVersion!==1) throw Error('不支持此结构化资料版本');
    await stageProfileUpdate(data.profile,data.kind==='structured-profile'?'导入结构化资料':'从备份恢复资料');
  } catch (err) {
    selectProfileTab('resume');workflowStatus('导入未应用：'+(err.message||'文件格式不正确'), true);
  }
}

async function clearData() {
  if (!confirm('确定清空所有已保存的个人信息（含学习记录与站点规则）？此操作不可恢复，建议先导出备份。')) return;
  await saveQueue;
  profile = {};
  settings = {};
  learned = {};
  siteRules = {};
  await chrome.storage.local.clear();
  location.reload();
}
