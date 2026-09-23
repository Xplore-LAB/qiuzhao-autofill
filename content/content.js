/* 秋招网申自动填充助手 - content script v1.16.10-dev
 *
 * 职责：
 *   1. 识别页面中的网申表单字段（中文/英文；label / placeholder / aria-label / name 属性多路匹配）
 *   2. 把用户保存在本地的个人信息填入对应控件
 *   3. 支持消息触发（弹窗按钮 / 右键菜单 / 快捷键）与页面加载后自动填充
 *   4. 学习式映射：记录用户手动填写过的「标签 -> 值」，下次同类标签自动填（跨站点复用）
 *   5. 站点规则：按域名配置的精确映射，优先于通用识别
 *   6. 未识别字段导出：右键复制当前页所有插件不认识的字段清单
 *
 * 敏感操作防护（任何时候都不违反）：
 *   - 密码、验证码、支付、银行卡、文件上传类控件一律不填充、不学习、不导出
 *   - 含密码框的表单（登录/注册）内的任何控件不填充、不学习
 *   - 自动模式遇到可见密码框（登录页）时整页跳过
 *   - 只在手动填充时点击已识别的自定义下拉/单选选项，绝不触碰提交、预览、暂存、上传按钮
 *   - 自动填充只操作原生输入控件，自定义控件留给用户手动触发
 *
 * 隐私：本脚本不直接发起网络请求。启用 AI 时由后台向用户配置的服务发送必要字段和资料片段。
 */
(() => {
  if (window.__QIUZHAO_AUTOFILL_CONTENT__) return;
  window.__QIUZHAO_AUTOFILL_CONTENT__ = true;

  /* ================= 字段定义（识别顺序即优先级） =================
   * patterns：对「字段文本」归一化后做正则匹配，数组靠前的模式更具体（得分更高）
   * excludes：任一候选文本命中则该控件对此字段出局（如「紧急联系人电话」不该被手机号命中）
   * type:'choice'：只匹配 select / radio，并用同义词表选择选项
   * multi:true：允许一个字段匹配多个控件（期望工作地点的省市级联）
   */
  const FIELDS = [
    { key: 'educationCollege', label: '学院', scope: /教育经历/, patterns: [/学院|院系/] },
    { key: 'educationLab', label: '实验室', scope: /教育经历/, patterns: [/实验室/] },
    { key: 'educationMentor', label: '导师姓名', scope: /教育经历/, patterns: [/导师姓名/] },
    { key: 'languageSpeaking', label: '听说能力', type: 'choice', scope: /语言能力/, patterns: [/听说能力/] },
    { key: 'languageWriting', label: '读写能力', type: 'choice', scope: /语言能力/, patterns: [/读写能力/] },
    { key: 'internshipAchievement', label: '工作业绩', scope: /实习经历/, patterns: [/工作业绩/] },
    { key: 'projectUrl', label: '项目链接', scope: /项目经历/, patterns: [/^项目链接$/] },
    { key: 'projectRole', label: '项目职务', scope: /项目经历/, patterns: [/^职务$|项目职务/] },
    { key: 'projectResponsibility', label: '项目职责', scope: /项目经历/, patterns: [/项目职责/] },
    { key: 'researchChannel', label: '发布渠道', scope: /论文|研究成果/, patterns: [/发布渠道|发表刊物/] },
    { key: 'researchAuthorOrder', label: '作者顺序', type: 'choice', scope: /论文|研究成果/, patterns: [/作者顺序/] },
    { key: 'researchUrl', label: '论文链接', scope: /论文|研究成果/, patterns: [/论文链接/] },
    { key: 'skillName', label: '技能类别', type: 'choice', scope: /IT技能/, patterns: [/技能类别/] },
    { key: 'skillLevel', label: '技能掌握程度', type: 'choice', scope: /IT技能/, patterns: [/^掌握程度$/] },
    { key: 'certificateName', label: '技能证书', scope: /技能证书/, patterns: [/技能证书/] },
    { key: 'competitionName', label: '竞赛名称', scope: /竞赛获奖/, patterns: [/竞赛名称/] },
    { key: 'competitionLevel', label: '竞赛获奖等级', scope: /竞赛获奖/, patterns: [/竞赛获奖等级/] },
    { key: 'competitionDate', label: '竞赛获奖时间', type: 'date', scope: /竞赛获奖/, patterns: [/竞赛获奖时间/] },
    { key: 'honorName', label: '荣誉名称', scope: /其他荣誉/, patterns: [/荣誉名称/] },
    { key: 'workName', label: '作品名称', scope: /作品信息/, patterns: [/作品名称/] },
    { key: 'workDescription', label: '作品描述', scope: /作品/, patterns: [/作品描述/] },
    { key: 'workUrl', label: '作品链接', scope: /作品信息/, patterns: [/作品链接/] },
    { key: 'recommendationCode', label: '推荐码', multi: true, patterns: [/^推荐码$|内推码|推荐人编码|邀请码/, /referralcode|invitecode/] },
    { key: 'familyName', label: '姓', patterns: [/姓氏/, /^姓$/, /lastname|surname|familyname/] },
    { key: 'givenName', label: '名', patterns: [/^名字$/, /^名$/, /givenname|firstname/] },
    { key: 'wechat', label: '微信号', patterns: [/微信/], excludes: [/公众号|二维码|截图/] },
    { key: 'politicalStatus', label: '政治面貌', type: 'choice', patterns: [/政治面貌/],
      options: { '中共党员': ['党员'], '中共预备党员': ['预备党员'], '共青团员': ['团员'], '民主党派': ['民主党派'], '无党派人士': ['无党派'], '群众': ['群众'] } },
    { key: 'nation', label: '民族', patterns: [/民族/] },
    { key: 'household', label: '户籍/籍贯', patterns: [/户籍所在地|户籍地址|籍贯|户口所在地|生源地/, /household|nativeplace/], excludes: [/性质|类型|迁移/] },
    { key: 'englishScore', label: '英语成绩', patterns: [/英语等级成绩|英语成绩|四六级成绩|外语成绩|英语分数|cet成绩/], excludes: [/等级选择/] },
    { key: 'englishLevel', label: '英语等级', patterns: [/英语等级|英语水平|外语水平|四六级|cet/], excludes: [/成绩|分数/] },
    { key: 'birthDate', label: '出生年月', type: 'date', patterns: [/出生日期|出生年月|出生时间|出生年月日|生日/, /dateofbirth|birthday|birthdate/] },
    { key: 'idNumber', label: '身份证号', patterns: [/身份证号|身份证|证件号码|证件号/, /idcard|idnumber|identity|idno/], excludes: [/证件类型|照片|扫描件|上传|邮寄/] },
    { key: 'graduationDate', label: '毕业时间', type: 'date', patterns: [/毕业时间|毕业年月|毕业日期|预计毕业|应届毕业|毕业年份/, /graduationdate|graduate|graduationyear/] },
    { key: 'gpa', label: 'GPA/绩点', patterns: [/gpa|绩点/] },
    { key: 'educationRank', label: '教育经历专业排名', fallbackKeys: ['rank'], patterns: [/^专业排名$/] },
    { key: 'rank', label: '专业排名', patterns: [/综合排名|年级排名|班级排名|排名|名次/] },
    { key: 'disciplineHighest', label: '最高学历学科', type: 'choice', patterns: [/最高学历学科|最高学历专业类别|最高学历学科门类/] },
    { key: 'disciplineBachelor', label: '本科学科', type: 'choice', patterns: [/本科学科|本科专业类别|本科学科门类/] },
    { key: 'computerLevel', label: '计算机等级', patterns: [/计算机等级|计算机水平|计算机证书/] },
    { key: 'height', label: '身高', patterns: [/^身高(?:cm|厘米)?$/, /^height(?:cm)?$/] },
    { key: 'weight', label: '体重', patterns: [/^体重(?:kg|公斤|千克)?$/, /^weight(?:kg)?$/] },
    { key: 'householdType', label: '户口性质', type: 'choice', patterns: [/户口性质|户籍性质|户口类型/],
      options: { '农业户口': ['农业', '农村'], '非农业户口': ['非农业', '非农', '城镇', '城市'] } },
    { key: 'maritalStatus', label: '婚姻状况', type: 'choice', patterns: [/婚姻状况|婚否|是否已婚/, /^maritalstatus$/],
      options: { '未婚': ['未婚', '否'], '已婚': ['已婚', '是'], '离异': ['离异', '离婚'] } },
    { key: 'graduateStatus', label: '应届/往届', type: 'choice', patterns: [/应届往届|应届\/往届|毕业生类型|是否应届/],
      options: { '应届': ['应届', '应届生'], '往届': ['往届', '往届生'] } },
    { key: 'interviewSite', label: '期望面试站点', type: 'choice', patterns: [/期望面试站点|面试站点|面试地点/] },
    { key: 'expectedCity', label: '期望工作地点', multi: true,
      patterns: [/期望工作地点|期望工作城市|期望工作地|期望城市|意向城市|期望地点|意向工作地/, /工作城市|工作地点/],
      excludes: [/现居|居住地|户籍|户口|籍贯|生源地|通讯地址|通信地址|目前工作地/] },
    { key: 'expectedPosition', label: '期望职位', patterns: [/期望职位|期望岗位|意向岗位|意向职位|应聘岗位|应聘职位|期望职务|目标岗位|求职意向/] },
    { key: 'expectedSalary', label: '期望薪资', patterns: [/期望薪资|期望薪水|薪资要求|期望薪酬|月薪要求|年薪要求|期望待遇|薪资期望/, /salary/] },
    { key: 'homepage', label: '个人主页', patterns: [/个人主页|个人网站|个人链接|github|gitee|技术博客|博客/, /blog|personalpage|personalwebsite/], excludes: [/上传|头像/] },
    { key: 'intro', label: '自我介绍', patterns: [/自我介绍|自我评价|自我描述|个人简介|个人描述|个人优势|个人陈述/] },
    { key: 'gender', label: '性别', type: 'choice', patterns: [/性别/, /^gender$/, /^sex$/],
      options: { '男': ['男', 'male', 'm'], '女': ['女', 'female', 'f'] } },
    { key: 'name', label: '姓名', patterns: [/姓名|名字|真实姓名/, /^name$/, /fullname|candidate.?name|yourname/],
      excludes: [/紧急|应急|推荐人|联系人|家长|亲属|emergency|guardian|reference/] },
    { key: 'phone', label: '手机号', patterns: [/手机号码|手机号|手机|联系电话|联系方式|电话号码|电话/, /mobile|phone|tel|contact/],
      excludes: [/紧急|应急|备用|家庭|宅电|联系人|单位电话|公司电话|宿舍|传真|fax|emergency|guardian/] },
    { key: 'email', label: '邮箱', patterns: [/邮箱|电子邮件|email/, /mail$/], excludes: [/密码|确认|验证|password/] },
    { key: 'educationSchool', label: '教育经历学校', fallbackKeys: ['school'], patterns: [/^学校名称$|^就读学校$|^院校名称$/] },
    { key: 'educationMajor', label: '教育经历专业', fallbackKeys: ['major'], patterns: [/^专业名称$|^所学专业$/] },
    { key: 'educationStartDate', label: '入学时间', type: 'date', scope: /教育经历|applicanteducation/, patterns: [/^开始时间$|入学时间|入学日期|教育开始时间/] },
    { key: 'educationEndDate', label: '教育结束时间', type: 'date', fallbackKeys: ['graduationDate'], scope: /教育经历|applicanteducation/, patterns: [/^结束时间$|教育结束时间|学历结束时间/] },
    { key: 'educationDegree', label: '教育经历学历', type: 'choice', fallbackKeys: ['degree'], patterns: [/^学历$|学历层次|教育程度/] },
    { key: 'educationDiscipline', label: '教育经历学科', type: 'choice', scope: /教育经历|applicanteducation/, patterns: [/^学科$|教育经历学科|学科门类/] },
    { key: 'academicDegree', label: '学位', type: 'choice', patterns: [/^学位$|学位名称|获得学位/] },
    { key: 'educationType', label: '学历类型', type: 'choice', patterns: [/^学历类型$/] },
    { key: 'trainingMethod', label: '培养方式', type: 'choice', patterns: [/培养方式|培养类型|学习形式/] },
    { key: 'unifiedRecruitment', label: '是否统招', type: 'choice', scope: /教育经历|applicanteducation/, patterns: [/是否统招|统招/], options: { '是': ['是', 'yes'], '否': ['否', 'no'] } },
    { key: 'overseasEducation', label: '是否海外留学', type: 'choice', scope: /教育经历|applicanteducation/, patterns: [/是否为海外留学经历|是否海外留学|海外留学经历/], options: { '是': ['是', 'yes'], '否': ['否', 'no'] } },
    { key: 'languageType', label: '语言类型', type: 'choice', scope: /语言能力|applicantlanguage/, patterns: [/^语言类型$|语种/] },
    { key: 'languageProficiency', label: '语言掌握程度', type: 'choice', scope: /语言能力|applicantlanguage/, patterns: [/^掌握程度$|语言熟练程度|语言水平/] },
    { key: 'projectName', label: '项目经历名称', scope: /项目经历|applicantproject/, patterns: [/项目经历名称|项目名称/] },
    { key: 'projectStartDate', label: '项目开始时间', type: 'date', scope: /项目经历|applicantproject/, patterns: [/^开始时间$|项目开始时间|项目起始时间/] },
    { key: 'projectEndDate', label: '项目结束时间', type: 'date', scope: /项目经历|applicantproject/, patterns: [/^结束时间$|项目结束时间|项目截止时间/] },
    { key: 'projectDescription', label: '项目经历描述', scope: /项目经历|applicantproject/, patterns: [/项目经历描述|项目描述|项目内容/] },
    { key: 'internshipCompany', label: '实习单位名称', scope: /实习经历|applicantintern/, patterns: [/^单位名称$|实习单位|公司名称/] },
    { key: 'internshipRole', label: '实习角色', scope: /实习经历|applicantintern/, patterns: [/^角色$|实习角色|实习职位|实习岗位/] },
    { key: 'internshipStartDate', label: '实习开始时间', type: 'date', scope: /实习经历|applicantintern/, patterns: [/^开始时间$|实习开始时间|实习起始时间/] },
    { key: 'internshipEndDate', label: '实习结束时间', type: 'date', scope: /实习经历|applicantintern/, patterns: [/^结束时间$|实习结束时间|实习截止时间/] },
    { key: 'internshipContent', label: '实习内容', scope: /实习经历|applicantintern/, patterns: [/实习内容|实习描述|工作内容|工作描述/] },
    { key: 'awardName', label: '奖项名称', scope: /获奖情况|奖励情况|荣誉奖项|applicantaward/, patterns: [/^奖项$|奖项名称|获奖名称|奖励名称|荣誉名称/] },
    { key: 'awardDate', label: '获奖时间', type: 'date', scope: /获奖情况|奖励情况|荣誉奖项|applicantaward/, patterns: [/^获奖时间$|获奖日期|颁发时间|奖励时间/] },
    { key: 'awardLevel', label: '获奖级别', type: 'choice', scope: /获奖情况|奖励情况|荣誉奖项|applicantaward/, patterns: [/^获奖级别$|奖项级别|奖励级别|荣誉级别/] },
    { key: 'awardDescription', label: '获奖描述', scope: /获奖情况|奖励情况|荣誉奖项|applicantaward/, patterns: [/^获奖描述$|奖项描述|奖励描述|获奖说明|奖项说明/] },
    { key: 'researchName', label: '研究成果名称', scope: /研究成果|研究情况|科研经历|科研成果|论文专利|applicantresearch/, patterns: [/^名称$|成果名称|研究成果名称|研究项目|课题名称|论文名称|论文题目|专利名称/] },
    { key: 'researchDate', label: '研究成果时间', type: 'date', scope: /研究成果|研究情况|科研经历|科研成果|论文专利|applicantresearch/, patterns: [/^时间$|成果时间|研究时间|发表时间|授权时间/] },
    { key: 'researchLevel', label: '研究成果等级', scope: /研究成果|研究情况|科研经历|科研成果|论文专利|applicantresearch/, patterns: [/^等级$|成果等级|研究类型|成果类型|论文级别|专利级别/] },
    { key: 'researchDescription', label: '研究成果描述', scope: /研究成果|研究情况|科研经历|科研成果|论文专利|applicantresearch/, patterns: [/^描述$|成果描述|研究成果描述|研究内容|研究职责|成果说明/] },
    { key: 'willingAllocation', label: '服从公司分配', type: 'choice', patterns: [/是否愿意服从公司分配|服从公司分配/], options: { '是': ['是', '愿意', 'yes'], '否': ['否', '不愿意', 'no'] } },
    { key: 'acceptRelocation', label: '接受外派', type: 'choice', patterns: [/是否接受外派|接受外派/], options: { '是': ['是', '接受', 'yes'], '否': ['否', '不接受', 'no'] } },
    { key: 'acceptUnderdevelopedOverseas', label: '接受海外欠发达地区分配', type: 'choice', patterns: [/是否可以接受海外欠发达地区分配|海外欠发达地区分配/], options: { '是': ['是', '接受', 'yes'], '否': ['否', '不接受', 'no'] } },
    { key: 'hasRelativesAtCompany', label: '亲属是否在本公司工作', type: 'choice', patterns: [/是否有亲属在本公司工作|亲属在本公司工作/], options: { '是': ['是', '有', 'yes'], '否': ['否', '无', 'no'] } },
    { key: 'school', label: '毕业院校', patterns: [/最高学历学校|毕业院校|就读院校|毕业学校|院校/, /school|university|college/], excludes: [/邮箱|高中|初中|中学|邮寄/] },
    { key: 'major', label: '专业', patterns: [/毕业专业|所学专业|专业/, /major/], excludes: [/课程|职务|职称|学科/] },
    { key: 'degree', label: '学历/学位', type: 'choice', patterns: [/学历|学位|文化程度/, /education|edulevel|edu_level|degree|qualification/],
      excludes: [/学科|专业类别|学科门类/],
      options: { '博士': ['博士', 'phd', 'doctor'], '硕士': ['硕士', '研究生', '硕士研究生', 'master'], '本科': ['本科', '大学本科', '学士', 'bachelor', 'undergraduate'], '专科': ['专科', '大专', '高职', 'associate'] } },
    { key: 'otherLanguageLevel', label: '其他外语等级', patterns: [/外语等级|其他外语水平|第二外语等级/] },
    { key: 'otherLanguage', label: '其他外语', type: 'choice', patterns: [/其他外语|第二外语|小语种/] },
    { key: 'scholarship', label: '奖学金', type: 'choice', patterns: [/^奖学金$|奖学金级别|获得奖学金/] },
    { key: 'outstandingGraduateLevel', label: '优秀毕业生级别', type: 'choice', patterns: [/优秀毕业生级别|优秀毕业生/] },
    { key: 'practiceCount', label: '项目或实习数量', type: 'choice', patterns: [/参与过的项目或实习实践数量|项目或实习数量|实习实践数量/] },
    { key: 'studentCadreLevel', label: '学生干部级别', type: 'choice', patterns: [/学生干部职务级别|学生干部级别/] },
    { key: 'studentRoles', label: '学生干部职务', type: 'choice', patterns: [/是否曾经担任如下职务|学生干部职务/] },
    { key: 'competitionAwardLevel', label: '竞赛奖项级别', type: 'choice', patterns: [/参与竞赛的奖项级别|竞赛奖项级别|竞赛获奖级别/] },
    { key: 'recruitmentSource', label: '招聘信息来源', type: 'choice', patterns: [/招聘信息来源|招聘渠道|信息来源|获知渠道/] },
  ];

  const REPEAT_GROUPS = [
    {bulkKey: 'skillsBulk', label: 'IT技能', primaryKey: 'skillName', fieldKeys: ['skillName', 'skillLevel'], aliases: {技能类别: 'skillName', 技能掌握程度: 'skillLevel'}},
    {bulkKey: 'certificatesBulk', label: '技能证书', primaryKey: 'certificateName', fieldKeys: ['certificateName'], aliases: {技能证书: 'certificateName'}},
    {bulkKey: 'competitionsBulk', label: '竞赛获奖', primaryKey: 'competitionName', fieldKeys: ['competitionName', 'competitionLevel', 'competitionDate'], aliases: {竞赛名称: 'competitionName', 竞赛获奖等级: 'competitionLevel', 竞赛获奖时间: 'competitionDate'}},
    {bulkKey: 'honorsBulk', label: '其他荣誉', primaryKey: 'honorName', fieldKeys: ['honorName'], aliases: {荣誉名称: 'honorName'}},
    {bulkKey: 'worksBulk', label: '作品信息', primaryKey: 'workName', fieldKeys: ['workName', 'workUrl', 'workDescription'], aliases: {作品名称: 'workName', 作品链接: 'workUrl', 作品描述: 'workDescription', 描述: 'workDescription'}},
    {
      bulkKey: 'educationBulk', label: '教育经历', primaryKey: 'educationSchool',
      fieldKeys: ['educationCollege', 'educationLab', 'educationMentor', 'educationSchool', 'educationMajor', 'educationStartDate', 'educationEndDate', 'educationDegree', 'educationDiscipline', 'academicDegree', 'educationType', 'trainingMethod', 'educationRank', 'unifiedRecruitment', 'overseasEducation'],
      aliases: { 学院: 'educationCollege', 实验室: 'educationLab', 导师姓名: 'educationMentor',
        学校: 'educationSchool', 学校名称: 'educationSchool', 院校: 'educationSchool', 院校名称: 'educationSchool',
        专业: 'educationMajor', 专业名称: 'educationMajor', 开始时间: 'educationStartDate', 入学时间: 'educationStartDate',
        结束时间: 'educationEndDate', 毕业时间: 'educationEndDate', 学历: 'educationDegree', 学科: 'educationDiscipline',
        学位: 'academicDegree', 学历类型: 'educationType', 培养方式: 'trainingMethod', 专业排名: 'educationRank', 是否统招: 'unifiedRecruitment',
        是否海外留学: 'overseasEducation', 是否为海外留学经历: 'overseasEducation'
      }, timeKeys: ['educationStartDate', 'educationEndDate']
    },
    {
      bulkKey: 'languagesBulk', label: '语言能力', primaryKey: 'languageType',
      fieldKeys: ['languageSpeaking', 'languageWriting', 'languageType', 'languageProficiency'],
      aliases: { 听说能力: 'languageSpeaking', 读写能力: 'languageWriting',  语言: 'languageType', 语种: 'languageType', 语言类型: 'languageType', 掌握程度: 'languageProficiency', 熟练程度: 'languageProficiency', 语言水平: 'languageProficiency' }
    },
    {
      bulkKey: 'projectsBulk', label: '项目经历', primaryKey: 'projectName',
      fieldKeys: ['projectUrl', 'projectRole', 'projectResponsibility', 'projectName', 'projectStartDate', 'projectEndDate', 'projectDescription'],
      aliases: { 项目链接: 'projectUrl', 项目职务: 'projectRole', 项目职责: 'projectResponsibility',  项目: 'projectName', 项目名称: 'projectName', 项目经历名称: 'projectName', 开始时间: 'projectStartDate', 结束时间: 'projectEndDate', 项目描述: 'projectDescription', 项目经历描述: 'projectDescription', 描述: 'projectDescription', 内容: 'projectDescription' },
      timeKeys: ['projectStartDate', 'projectEndDate']
    },
    {
      bulkKey: 'internshipsBulk', label: '实习经历', primaryKey: 'internshipCompany',
      fieldKeys: ['internshipAchievement', 'internshipCompany', 'internshipRole', 'internshipStartDate', 'internshipEndDate', 'internshipContent'],
      aliases: { 工作业绩: 'internshipAchievement',  单位: 'internshipCompany', 单位名称: 'internshipCompany', 公司: 'internshipCompany', 公司名称: 'internshipCompany', 角色: 'internshipRole', 岗位: 'internshipRole', 职位: 'internshipRole', 开始时间: 'internshipStartDate', 结束时间: 'internshipEndDate', 实习内容: 'internshipContent', 工作内容: 'internshipContent', 描述: 'internshipContent' },
      timeKeys: ['internshipStartDate', 'internshipEndDate']
    },
    {
      bulkKey: 'awardsBulk', label: '获奖情况', addLabels: ['添加获奖情况', '添加奖励情况', '添加荣誉奖项'], primaryKey: 'awardName',
      fieldKeys: ['awardName', 'awardDate', 'awardLevel', 'awardDescription'],
      aliases: { 奖项: 'awardName', 奖项名称: 'awardName', 获奖名称: 'awardName', 奖励名称: 'awardName', 荣誉名称: 'awardName', 获奖奖项: 'awardName', 获奖时间: 'awardDate', 获奖日期: 'awardDate', 颁发时间: 'awardDate', 奖励时间: 'awardDate', 获奖级别: 'awardLevel', 奖项级别: 'awardLevel', 奖励级别: 'awardLevel', 荣誉级别: 'awardLevel', 获奖描述: 'awardDescription', 奖项描述: 'awardDescription', 奖励描述: 'awardDescription', 获奖说明: 'awardDescription', 奖项说明: 'awardDescription', 描述: 'awardDescription' }
    },
    {
      bulkKey: 'researchBulk', label: '研究成果', addLabels: ['添加研究成果', '添加研究情况', '添加科研经历', '添加科研成果', '添加论文专利'], primaryKey: 'researchName',
      fieldKeys: ['researchChannel', 'researchAuthorOrder', 'researchUrl', 'researchName', 'researchDate', 'researchLevel', 'researchDescription'],
      aliases: { 发布渠道: 'researchChannel', 作者顺序: 'researchAuthorOrder', 论文链接: 'researchUrl',  名称: 'researchName', 成果名称: 'researchName', 研究项目: 'researchName', 课题名称: 'researchName', 论文名称: 'researchName', 论文题目: 'researchName', 专利名称: 'researchName', 时间: 'researchDate', 成果时间: 'researchDate', 研究时间: 'researchDate', 发表时间: 'researchDate', 授权时间: 'researchDate', 等级: 'researchLevel', 成果等级: 'researchLevel', 研究类型: 'researchLevel', 成果类型: 'researchLevel', 描述: 'researchDescription', 成果描述: 'researchDescription', 研究内容: 'researchDescription', 研究职责: 'researchDescription', 成果说明: 'researchDescription' }
    }
  ];

  const CUSTOM_SELECT_SELECTOR = [
    '.ant-picker-range .ant-picker-input',
    '.ant-picker:not(.ant-picker-range)',
    '.ud__select:has(.ud__select__selector)', '.phoenix-select', '.ant-select', '.el-select', '.arco-select', '.ivu-select',
    '.ant-cascader', '.el-cascader', '.arco-cascader', '.ivu-cascader',
    '.select2-container', 'div[role="combobox"]', 'span[role="combobox"]',
    '[role="combobox"][aria-haspopup="listbox"]'
  ].join(',');

  const CUSTOM_RADIO_SELECTOR = [
    '.phoenix-radio-group', '.ant-radio-group', '.el-radio-group', '.arco-radio-group',
    '.ivu-radio-group', '[role="radiogroup"]'
  ].join(',');

  const CUSTOM_CONTROL_SELECTOR = CUSTOM_SELECT_SELECTOR + ',' + CUSTOM_RADIO_SELECTOR;

  const AUTOCOMPLETE_CONTAINER_SELECTOR = [
    '.ud__select', '.phoenix-auto-complete-container', '.ant-select-auto-complete', '.el-autocomplete',
    '.arco-auto-complete', '[data-autocomplete]', '[role="combobox"]'
  ].join(',');

  const FIELD_CONTAINER_SELECTOR = [
    '.ud-formily-item', '.form-item', '.ant-form-item', '.el-form-item', '.arco-form-item', '.ivu-form-item',
    '.form-group', '.field-row', '.field-item', '[data-field]', '[data-testid*="field"]'
  ].join(',');

  const FIELD_LABEL_SELECTOR = [
    '.ud-formily-item-label', '.form-item__text', '.ant-form-item-label', '.el-form-item__label', '.arco-form-item-label',
    '.ivu-form-item-label', '.control-label', '.form-label', '.field-label', 'legend', 'label'
  ].join(',');

  /* ================= 敏感操作防护 ================= */

  const SENSITIVE_TEXT = /密码|口令|验证码|校验码|动态码|短信验证|手机验证|支付|付款|银行卡|信用卡|卡号|有效期|安全码|交易码|支付码|cvv|cvc|otp|^pin$|pincode|paymentpin|captcha|password|passwd|cardnumber|creditcard|securitycode|verificationcode/;

  let pwdCache = { at: 0, val: false };
  function hasVisiblePassword() {
    const now = Date.now();
    if (now - pwdCache.at > 3000) {
      let found = false;
      const list = document.querySelectorAll('input[type="password"]');
      for (const p of list) { if (isVisible(p)) { found = true; break; } }
      pwdCache = { at: now, val: found };
    }
    return pwdCache.val;
  }

  function inLoginForm(el) {
    const form = el.closest ? el.closest('form') : null;
    return !!(form && form.querySelector('input[type="password"]'));
  }

  function isSensitiveControl(el) {
    const t = inputType(el);
    if (t === 'password' || t === 'file') return true;
    const cands = getTextCandidates(el);
    return cands.some(c => { const n = normalize(c.text); return n && SENSITIVE_TEXT.test(n); });
  }

  /* ================= 工具函数 ================= */

  function normalize(s) {
    return String(s == null ? '' : s)
      .replace(/[\s\u00A0·•*,，。.、:：;；!！?？()（）[\]【】{}'"‘’“”`~～\-_/\\|]+/g, '')
      .toLowerCase();
  }

  function isGenericLabel(s) {
    return /^(请输入|请选择|搜索|请填写|输入|选择|必填|选填)$/.test(normalize(s));
  }

  function isUsableCustom(item) {
    return !!(item && item.label && item.value && !isGenericLabel(item.label));
  }

  function isIgnoredControl(el) {
    return getTextCandidates(el).some(c => /^(搜索职位关键词|搜索岗位关键词|搜索职位|岗位搜索)$/.test(normalize(c.text)));
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function isRadio(el) {
    return el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'radio';
  }

  function isCustomSelect(el) {
    return !!(el && el.matches && el.matches(CUSTOM_SELECT_SELECTOR));
  }

  function isCustomRadioGroup(el) {
    return !!(el && el.matches && el.matches(CUSTOM_RADIO_SELECTOR));
  }

  function isChoiceControl(el) {
    return el.tagName === 'SELECT' || isRadio(el) || isCustomSelect(el) || isCustomRadioGroup(el);
  }

  function isAutocompleteInput(el) {
    return el.tagName === 'INPUT' && !!(el.closest && el.closest(AUTOCOMPLETE_CONTAINER_SELECTOR));
  }

  function inputType(el) {
    return el.tagName === 'INPUT' ? (el.getAttribute('type') || 'text').toLowerCase() : '';
  }

  function isVisible(el) {
    if (!el.isConnected) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    for(let parent=el.parentElement;parent && parent!==document.body;parent=parent.parentElement){
      const parentStyle=window.getComputedStyle(parent);
      if(parent.hidden || parentStyle.display==='none' || parentStyle.visibility==='hidden')return false;
      // Virtualized widgets keep accessible option mirrors inside zero-sized clipped lists.
      // Their descendants may have a rect, but they are not visual click targets.
      if(/hidden|clip/.test(parentStyle.overflow+parentStyle.overflowX+parentStyle.overflowY)){
        const bounds=parent.getBoundingClientRect();
        if(bounds.width===0 || bounds.height===0)return false;
      }
    }
    if (isRadio(el)) return true;
    if (style.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function isDisabledCustom(el) {
    const cls = String(el.className || '');
    return el.getAttribute('aria-disabled') === 'true' || /(^|\s)(disabled|is-disabled)(\s|$)/i.test(cls);
  }

  function radioGroupOf(anchor) {
    const name = anchor.name;
    if (!name) return [anchor];
    const root = anchor.closest('form') || document;
    return Array.from(root.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]'));
  }

  function commonContainer(radios) {
    if (!radios.length) return null;
    let cont = radios[0];
    while (cont && cont !== document) {
      if (radios.every(r => cont.contains(r))) return cont;
      cont = cont.parentElement;
    }
    return document.body || document.documentElement;
  }

  /* ================= 控件收集 ================= */

  function collectControls(filterSensitive) {
    const anchors = [];
    const seen = new Set();
    const seenRadioGroups = new Set();
    const els = document.querySelectorAll('input, select, textarea, [contenteditable="true"]');
    for (const el of els) {
      if (el.disabled) continue;
      if (el.closest && el.closest(CUSTOM_CONTROL_SELECTOR)) continue;
      const tag = el.tagName;
      if (tag === 'INPUT') {
        const type = inputType(el);
        if (['hidden', 'submit', 'button', 'file', 'image', 'reset', 'password', 'checkbox'].includes(type)) continue;
        if (type === 'radio') {
          const key = 'radio:' + (el.name || '');
          if (seenRadioGroups.has(key)) continue;
          if (!radioGroupOf(el).some(isVisible)) continue;
          seenRadioGroups.add(key);
          if (filterSensitive && isSensitiveControl(el)) continue;
          anchors.push(el);
          seen.add(el);
          continue;
        }
        if (el.readOnly) continue;
      }
      if (!isVisible(el) || isIgnoredControl(el)) continue;
      if (filterSensitive && (isSensitiveControl(el) || inLoginForm(el))) continue;
      anchors.push(el);
      seen.add(el);
    }

    for (const el of document.querySelectorAll(CUSTOM_CONTROL_SELECTOR)) {
      if (seen.has(el) || isDisabledCustom(el)) continue;
      const parentCustom = el.parentElement && el.parentElement.closest(CUSTOM_CONTROL_SELECTOR);
      if (parentCustom) continue;
      if (!isVisible(el) || isIgnoredControl(el)) continue;
      if (filterSensitive && (isSensitiveControl(el) || inLoginForm(el))) continue;
      anchors.push(el);
      seen.add(el);
    }
    return anchors;
  }

  /* ================= 字段文本提取 =================
   * 候选文本权重：label[for] 10 > label 包裹/aria-label 8 > 表格前一格 5 > placeholder 5
   * > 前一个兄弟节点 4 > name/id 属性 3 > 后一个兄弟节点 2
   */
  function getTextCandidates(el) {
    const out = [];
    const seen = new Set();
    const push = (s, w) => {
      const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
      if (t && t.length <= 60 && !seen.has(t)) { seen.add(t); out.push({ text: t, w }); }
    };
    if (el.matches('.ant-picker-range .ant-picker-input')) {
      const inputs=Array.from(el.closest('.ant-picker-range').querySelectorAll('.ant-picker-input'));
      if(inputs.length===2)push(inputs.indexOf(el)===0?'开始时间':'结束时间',10);
    }

    if (el.id) {
      document.querySelectorAll('label[for="' + CSS.escape(el.id) + '"]').forEach(l => push(l.textContent, 10));
    }

    const labelledBy = (el.getAttribute('aria-labelledby') || '').trim();
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const node = document.getElementById(id);
        if (node) push(node.textContent, 10);
      }
    }
    const udRange = el.closest('.throne-biz-date-range-picker-wrapper');
    if (udRange) {
      const dates=Array.from(udRange.querySelectorAll('.throne-biz-date-range-picker-input input'));
      if(dates.length===2 && dates.includes(el))push(dates.indexOf(el)===0?'开始时间':'结束时间',11);
    }
    const wrap = el.closest('label');
    if (wrap) push(wrap.textContent, 8);
    push(el.getAttribute('aria-label'), 8);
    push(el.getAttribute('title'), 6);
    push(el.getAttribute('placeholder'), 5);
    push(el.getAttribute('data-label'), 8);
    push(el.getAttribute('data-field-label'), 8);
    push(el.getAttribute('data-form-field-i18n-name'), 10);
    push(el.getAttribute('autocomplete'), 4);

    const fieldContainer = el.closest && el.closest(FIELD_CONTAINER_SELECTOR);
    if (fieldContainer) {
      push(fieldContainer.getAttribute('data-label'), 9);
      push(fieldContainer.getAttribute('data-field-label'), 9);
      push(fieldContainer.getAttribute('data-form-field-i18n-name'), 10);
      const labels = fieldContainer.querySelectorAll(FIELD_LABEL_SELECTOR);
      let added = 0;
      for (const label of labels) {
        if (label.closest && label.closest(CUSTOM_CONTROL_SELECTOR)) continue;
        push(label.textContent, 9);
        added++;
        if (added >= 3) break;
      }
    }

    const base = isRadio(el) ? (commonContainer(radioGroupOf(el)) || el) : el;

    let sib = base.previousElementSibling;
    let hops = 0;
    while (sib && hops < 2) {
      if (sib.textContent && sib.textContent.trim()) { push(sib.textContent, 4); break; }
      sib = sib.previousElementSibling;
      hops++;
    }
    if (base.previousSibling && base.previousSibling.nodeType === 3) push(base.previousSibling.textContent, 4);

    const cell = base.closest('td,th');
    if (cell && cell.previousElementSibling) push(cell.previousElementSibling.textContent, 5);

    if (!isRadio(el) && base.nextElementSibling) push(base.nextElementSibling.textContent, 2);

    push(el.getAttribute('name'), 3);
    if (el.id) push(el.id, 3);

    return out;
  }

  function bestLabelTextFrom(cands) {
    let best = null;
    for (const c of cands || []) if (!best || c.w > best.w) best = c;
    return best ? best.text : null;
  }

  function controlScopeText(el) {
    let node = el;
    for (let level = 0; node && level < 12; level++, node = node.parentElement) {
      const marker = normalize((node.id || '') + ' ' + (typeof node.className === 'string' ? node.className : ''));
      if (/applicantproject|applicantintern|applicanteducation|applicantlanguage|applicantaward|applicantresearch/.test(marker)) return marker;
      let prev = node.previousElementSibling;
      for (let hop = 0; prev && hop < 3; hop++, prev = prev.previousElementSibling) {
        const text = String(prev.innerText || prev.textContent || '').replace(/\s+/g, ' ').trim();
        const normalized = normalize(text);
        if (text && text.length <= 80 && /^(教育经历|项目经历|实习经历|语言能力|获奖情况|研究成果|附加问题)(?:$|[（(])/.test(normalized)) return normalized;
      }
    }
    return '';
  }

  /* ================= 匹配打分 ================= */

  function matchScore(field, candidates, el) {
    if (!candidates || !candidates.length) return 0;
    if (field.scope && (!el || !field.scope.test(controlScopeText(el)))) return 0;
    const normed = candidates.map(c => ({ n: normalize(c.text), w: c.w }));
    if (normed.some(c => c.n && field.excludes && field.excludes.some(re => re.test(c.n)))) return 0;
    let best = 0;
    for (const c of normed) {
      if (!c.n) continue;
      for (let i = 0; i < field.patterns.length; i++) {
        if (field.patterns[i].test(c.n)) {
          const s = c.w + (field.patterns.length - i);
          if (s > best) best = s;
          break;
        }
      }
    }
    return best;
  }

  const STRICT_MATCH_SCORE = 7;

  /* ================= 填充实现 ================= */

  let programmaticFill = false;
  let ignoreLearningUntil = 0;
  let activeFillRun = null;
  let lastManualStatus = null;

  function checkFillRun() {
    if (!activeFillRun || activeFillRun.cleaning) return;
    if (activeFillRun.cancelled) throw new Error('fill-cancelled');
    if (Date.now() >= activeFillRun.deadline) throw new Error('fill-timeout');
  }

  function boundedRequest(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
      const until = Date.now() + timeoutMs;
      const timer = setInterval(() => {
        try {
          checkFillRun();
          if (Date.now() >= until) throw new Error('request-timeout');
        } catch (error) { clearInterval(timer); reject(error); }
      }, 100);
      Promise.resolve(promise).then(value => {
        clearInterval(timer);
        try { checkFillRun(); resolve(value); } catch (error) { reject(error); }
      }, error => { clearInterval(timer); reject(error); });
    });
  }

  function fireEvents(el) {
    // 只派发 input/change，绝不派发 submit/click/blur，避免触发页面提交等敏感行为
    programmaticFill = true;
    try {
      let inputEvent;
      try {
        inputEvent = new InputEvent('input', { bubbles: true, inputType: 'insertText', data: null });
      } catch (error) {
        inputEvent = new Event('input', { bubbles: true });
      }
      el.dispatchEvent(inputEvent);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } finally { programmaticFill = false; }
  }

  function setNativeValue(el, value) {
    checkFillRun();
    let v = String(value == null ? '' : value);
    const max = el.getAttribute('maxlength');
    if (max && /^\d+$/.test(max)) v = v.slice(0, parseInt(max, 10));
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
      : el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
    if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, v); else el.value = v;
    fireEvents(el);
    return el.value === v && v === String(value == null ? '' : value);
  }

  function wait(ms) {
    checkFillRun();
    return new Promise((resolve, reject) => setTimeout(() => {
      try { checkFillRun(); resolve(); } catch (error) { reject(error); }
    }, ms));
  }

  // Check immediately; poll properties as well as DOM because value writes need not
  // generate mutations. Bounded samples retain cancellation and timeout behavior.
  async function waitForControlState(predicate, timeoutMs, stableSamples = 1) {
    let stable = 0;
    const interval = 40, attempts = Math.ceil(timeoutMs / interval);
    for (let attempt = 0; attempt <= attempts; attempt++) {
      checkFillRun();
      stable = predicate() ? stable + 1 : 0;
      if (stable >= stableSamples) return true;
      if (attempt < attempts) await wait(Math.min(interval, timeoutMs - attempt * interval));
    }
    return false;
  }

  async function waitForVisibleQuery(selector, timeoutMs) {
    const until = Date.now() + (timeoutMs || 800);
    do {
      const matches = Array.from(document.querySelectorAll(selector)).filter(isVisible);
      if (matches.length) return matches[matches.length - 1];
      await wait(60);
    } while (Date.now() < until);
    return null;
  }

  function safeCustomClick(el, mouseSequence = false) {
    checkFillRun();
    if (!el || !el.isConnected || !isVisible(el)) return false;
    ignoreLearningUntil = Date.now() + 700;
    programmaticFill = true;
    try {
      if (mouseSequence) {
        el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true,cancelable:true,button:0,buttons:1,view:window}));
        if (typeof el.focus === 'function') el.focus({preventScroll:true});
        el.dispatchEvent(new MouseEvent('mouseup', {bubbles:true,cancelable:true,button:0,view:window}));
      }
      if (typeof el.click === 'function') el.click();
      else el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, composed:true, view:window}));
      return true;
    }
    finally { programmaticFill = false; }
  }

  function fireEnter(el) {
    programmaticFill = true;
    try {
      if (typeof el.focus === 'function') el.focus({ preventScroll: true });
      for (const type of ['keydown', 'keypress', 'keyup']) {
        el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
      }
    } finally { programmaticFill = false; }
  }

  function valueCandidates(field, value) {
    const synonyms = (field && field.options && field.options[value]) || [];
    return [value].concat(synonyms).map(v => String(v == null ? '' : v).trim()).filter(Boolean);
  }

  function choiceTextScore(text, candidates, placeAware) {
    const n = normalize(text);
    if (!n || n.length > 80) return 0;
    let best = 0;
    for (const cand of candidates) {
      const c = normalize(cand);
      if (!c) continue;
      if (n === c) best = Math.max(best, 1000 + n.length);
      else if (c.length >= 2 && n.indexOf(c) >= 0) best = Math.max(best, 800 + c.length);
      else if (n.length >= 2 && c.indexOf(n) >= 0) best = Math.max(best, 700 + n.length);
      if (placeAware) {
        const pn = n.replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|省|市|地区|盟|区|县$/g, '');
        const pc = c.replace(/特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|省|市|地区|盟|区|县/g, '');
        if (pn.length >= 2 && pc.indexOf(pn) >= 0) best = Math.max(best, 600 + pn.length);
      }
    }
    return best;
  }

  function customControlHasValue(el) {
    return customControlValueTexts(el).length > 0;
  }

  function customControlValueTexts(el) {
    const selector = [
      '[aria-selected="true"]', '.is-selected', '.selected',
      '.phoenix-select__singleValue', '.phoenix-select__multiValue', '.phoenix-select__value',
      '.phoenix-select__tipEle', '.phoenix-select__placeHolder:not(.phoenix-select__placeHolder--show)',
      '[class*="calcEle"]', 'input:not([type="hidden"])', 'textarea',
      '.ud__select__selector__selectItem', '.ud__select__selector__tag .ud__tag__content', '.ant-select-selection-item', '.el-select__selected-item', '.el-select__tags-text',
      '.arco-select-view-value', '.arco-select-view-tag', '.ivu-select-selected-value',
      '.select2-selection__rendered', '[aria-checked="true"]', 'input[type="radio"]:checked',
      '.phoenix-radio--checked', '.phoenix-radio-group__radioItem--checked', '.ant-radio-wrapper-checked',
      '.el-radio.is-checked', '.arco-radio-checked', '.ivu-radio-wrapper-checked'
    ].join(',');
    return Array.from(new Set(Array.from(el.querySelectorAll(selector))
      .filter(node => !isCustomRadioGroup(el) || !isRadio(node) || node.checked)
      .filter(node => isVisible(node) || (isRadio(node) && node.checked))
      .filter(node => !node.matches('input:not([readonly]),textarea') || isCustomRadioGroup(el) || !!node.closest('.ant-picker,.el-date-editor,.arco-picker'))
      .map(node => {
        if (isCustomRadioGroup(el)) {
          const item = node.closest('.phoenix-radio-group__radioItem,.ant-radio-wrapper,.el-radio,.arco-radio,.ivu-radio-wrapper,label,[role="radio"]');
          return (item && item.textContent) || node.getAttribute('aria-label') || node.value || node.textContent || '';
        }
        return node.value || node.textContent || node.getAttribute('aria-label') || '';
      })
      .map(text => String(text).replace(/\s+/g, ' ').trim())
      .filter(text => text && !/^(请选择|请选择.*|please select|select\.\.\.)$/i.test(text))));
  }

  function customControlValueText(el) {
    return customControlValueTexts(el).join(' ');
  }

  function customControlMatchesValue(el, field, value) {
    return customControlValueTexts(el).some(text =>
      !!choiceTextScore(text, valueCandidates(field, value), !!(field && (field.key === 'household' || field.key === 'expectedCity'))));
  }

  function controlHasValue(el) {
    if (isCustomSelect(el) || isCustomRadioGroup(el)) return customControlHasValue(el);
    if (isRadio(el)) return radioGroupOf(el).some(r => r.checked);
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return !!String(el.textContent || '').trim();
    return !!String(el.value || '').trim();
  }

  function visibleChoiceLayers() {
    const selector = [
      '.ud__select__dropdown', '.common-unmodeled-layer', '.ant-select-dropdown', '.el-select-dropdown',
      '.arco-select-popup', '.ivu-select-dropdown', '.select2-dropdown',
      '.ant-picker-dropdown', '.el-picker-panel', '.arco-picker-container', '.ivu-date-picker-rel',
      '.phoenix-date-picker', '.phoenix-auto-complete-list', '.el-autocomplete-suggestion',
      '.ant-cascader-menus', '.el-cascader-panel', '.arco-cascader-panel', '[role="listbox"]'
    ].join(',');
    return Array.from(document.querySelectorAll(selector)).filter(isVisible);
  }

  function ownedChoiceLayer(anchor, layers) {
    const controllers = [anchor, ...Array.from(anchor.querySelectorAll('[aria-controls],[aria-owns]'))];
    const ids = controllers.flatMap(el => ((el.getAttribute('aria-controls') || '') + ' ' + (el.getAttribute('aria-owns') || '')).split(/\s+/)).filter(Boolean);
    const roots = layers.filter(layer => !layers.some(other => other !== layer && other.contains(layer)));
    if (ids.length) {
      const owned = roots.filter(layer => ids.some(id => layer.id === id || Array.from(layer.querySelectorAll('[id]')).some(el => el.id === id)));
      return owned.length === 1 ? owned[0] : null;
    }
    // Without a declared relationship only a single visible popup is safe.
    return roots.length === 1 ? roots[0] : null;
  }

  const OPTION_SELECTOR = [
    '.ud__tree__node', '.ud__select__list__item', '.phoenix-selectList__listItem', '.list-item-container', '[role="option"]',
    '.phoenix-auto-complete-list__item', '.phoenix-auto-complete__item',
    '.ant-select-item-option', '.el-select-dropdown__item', '.arco-select-option',
    '.ivu-select-item', '.select2-results__option', '.ant-cascader-menu-item',
    '.el-cascader-node', '.arco-cascader-list-item', '.ivu-cascader-menu-item'
  ].join(',');

  function bestVisibleOption(layer, candidates, placeAware, seen) {
    let best = null;
    let ambiguous = false;
    const known = Array.from(layer.querySelectorAll(OPTION_SELECTOR));
    // Limit fallback discovery to the associated popup, never arbitrary page text.
    const options = known.length ? known : Array.from(layer.querySelectorAll('li,label,[role="radio"],[role="checkbox"]'));
    for (const option of options) {
      if (!isVisible(option) || option.getAttribute('aria-disabled') === 'true') continue;
      if (option.disabled || option.querySelector('input:disabled')) continue;
      if (/(^|\s)(disabled|is-disabled)(\s|$)/i.test(String(option.className || ''))) continue;
      const text = String(option.textContent || '').replace(/\s+/g, ' ').trim();
      const key = normalize(text);
      if (!key || seen.has(key)) continue;
      const score = choiceTextScore(text, candidates, placeAware);
      if (score && (!best || score > best.score)) {
        best = { el: option, text: text, score: score }; ambiguous = false;
      } else if (score && best && score === best.score && !best.el.contains(option) && !option.contains(best.el)) {
        ambiguous = true;
      }
    }
    return ambiguous ? null : best;
  }

  function optionClickTarget(option) {
    if (!option || !option.querySelectorAll) return option;
    const udCheckbox=option.querySelector('.ud__checkbox');
    if(udCheckbox && isVisible(udCheckbox) && !udCheckbox.querySelector('input:disabled,[aria-disabled="true"]'))return udCheckbox;
    const icon = option.querySelector('.icon-container svg');
    if (icon && isVisible(icon)) return icon;
    // A visible row can wrap an actual radio/checkbox or a child label with its own handler.
    const targets = Array.from(option.querySelectorAll('input[type="radio"],input[type="checkbox"],[role="radio"],[role="checkbox"],.icon-container,.ant-select-item-option-content,.el-cascader-node__label,.ud__tree__node__label'));
    return targets.find(el => isVisible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true') || option;
  }

  async function waitForChoiceOption(anchor, candidates, placeAware, seen) {
    // Menus without a search box can also load their options asynchronously.
    for (let attempt = 0; attempt < 30; attempt++) {
      const layer = ownedChoiceLayer(anchor, visibleChoiceLayers());
      if (layer) {
        const best = bestVisibleOption(layer, candidates, placeAware, seen);
        if (best) return {layer, best};
      }
      await wait(100);
    }
    return null;
  }

  function exactLayerButton(layer, names) {
    for (const el of layer.querySelectorAll('button,.phoenix-button,[role="button"]')) {
      if (!isVisible(el)) continue;
      const text = String(el.textContent || '').replace(/\s+/g, '').trim();
      if (names.indexOf(text) >= 0) return el.querySelector('.phoenix-button__content,.phoenix-button__wraper') || el;
    }
    return null;
  }

  async function confirmChoiceSelection(anchor, field, value) {
    for (let attempt = 0; attempt < 20; attempt++) {
      checkFillRun();
      if (customControlMatchesValue(anchor, field, value)) return true;
      const layer = ownedChoiceLayer(anchor, visibleChoiceLayers());
      if (!layer) { await wait(100); continue; }
      const confirm = exactLayerButton(layer, ['确定', '确认']);
      if (!confirm) { await wait(100); continue; }
      const candidates = valueCandidates(field, value);
      const option = bestVisibleOption(layer, candidates, false, new Set());
      const selectedSelector = '[aria-selected="true"],[aria-checked="true"],input:checked,.RadioChecked,.is-selected,.ant-select-item-option-selected';
      const selected = option && (option.el.matches(selectedSelector) || option.el.querySelector(selectedSelector));
      const selectionPanel = layer.querySelector('.select-data-container');
      const panelMatches = selectionPanel && choiceTextScore(selectionPanel.textContent, candidates, false) > 0;
      const disabled = confirm.disabled || confirm.closest('[disabled],[aria-disabled="true"],.is-disabled,.disabled');
      if ((selected || panelMatches) && !disabled) {
        safeCustomClick(confirm);
        for (let read = 0; read < 10; read++) {
          await wait(100);
          if (customControlMatchesValue(anchor, field, value)) return true;
        }
        return false;
      }
      await wait(100);
    }
    return false;
  }

  function fireEscape(el) {
    const target = el && el.isConnected ? el : document.activeElement;
    if (!target || !target.dispatchEvent) return;
    programmaticFill = true;
    try {
      for (const type of ['keydown', 'keyup']) {
        target.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
      }
    } finally { programmaticFill = false; }
  }

  async function dismissVisibleChoiceLayers() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const layers = visibleChoiceLayers();
      if (!layers.length) return true;
      let acted = false;
      for (let i = layers.length - 1; i >= 0; i--) {
        const cancel = exactLayerButton(layers[i], ['取消', '关闭']);
        if (cancel && safeCustomClick(cancel)) acted = true;
      }
      if (!acted) {
        fireEscape(document.activeElement);
        await wait(35);
        if (visibleChoiceLayers().length) {
          const openAnchor = document.querySelector('.phoenix-select--active,.ant-select-open,.el-select.is-focus,.arco-select-view-focus');
          if (openAnchor && openAnchor!==activeDatePopup?.anchor && safeCustomClick(openAnchor)) acted = true;
          // Only toggle a date anchor whose popup this run actually opened.
          const owned=activeDatePopup;
          if(!acted && owned && !owned.closeAttempted && owned.anchor.isConnected && isVisible(owned.layer)
            && ownedChoiceLayer(owned.anchor,visibleChoiceLayers())===owned.layer){
            owned.closeAttempted=true;
            acted=safeCustomClick(owned.anchor);
            if(typeof traceStep==='function')traceStep('date-close',owned.anchor,null,{reason:'owned-anchor-toggle',ok:acted});
          }
        }
      }
      await wait(80);
    }
    return !visibleChoiceLayers().length;
  }

  async function fillPhoenixMonthPicker(anchor, layer, match) {
    const targetYear = Number(match[1]);
    const targetMonth = Number(match[2]);
    if (!targetYear || targetMonth < 1 || targetMonth > 12) return false;
    const yearSelector = '.phoenix-calendar-month-panel-year-select-content,.phoenix-calendar-year-select';
    for (let step = 0; step < 80; step++) {
      const yearNode = layer.querySelector(yearSelector);
      const currentMatch = String(yearNode && yearNode.textContent || '').match(/\d{4}/);
      if (!currentMatch) break;
      const currentYear = Number(currentMatch[0]);
      if (currentYear === targetYear) break;
      const buttonSelector = currentYear > targetYear
        ? '.phoenix-calendar-month-panel-prev-year-btn,.phoenix-calendar-prev-year-btn'
        : '.phoenix-calendar-month-panel-next-year-btn,.phoenix-calendar-next-year-btn';
      const button = layer.querySelector(buttonSelector);
      if (!button || !safeCustomClick(button)) break;
      for (let retry = 0; retry < 15; retry++) {
        await wait(80);
        const updated = String(layer.querySelector(yearSelector)?.textContent || '').match(/\d{4}/);
        if (updated && Number(updated[0]) !== currentYear) break;
        if (retry === 14) return false;
      }
    }
    const yearNode = layer.querySelector(yearSelector);
    const selectedYear = Number((String(yearNode && yearNode.textContent || '').match(/\d{4}/) || [0])[0]);
    if (selectedYear !== targetYear) return false;
    const monthCells = Array.from(layer.querySelectorAll('.phoenix-calendar-month-panel-cell'));
    const monthCell = monthCells.find(cell => normalize(cell.textContent) === String(targetMonth) + '月');
    const target = monthCell && (monthCell.querySelector('.phoenix-calendar-month-panel-month') || monthCell);
    if (!target || /disabled/.test(monthCell.className) || target.getAttribute('aria-disabled') === 'true' || !safeCustomClick(target)) return false;
    for (let retry = 0; retry < 15; retry++) {
      await wait(100);
      if (customControlMatchesValue(anchor, { type: 'date' }, targetYear + '-' + pad2(targetMonth))) return true;
    }
    return false;
  }

  const openDateRanges = new WeakSet();
  let activeDatePopup=null;
  async function fillCustomDate(anchor, value) {
    if(typeof traceStep==='function')traceStep('date-open',anchor,null);
    const m = String(value).match(/(\d{4})\s*[-年/.]\s*(\d{1,2})(?:\s*[-月/.]\s*(\d{1,2}))?/);
    if (!m) return false;
    const range=anchor.closest('.ant-picker-range');
    const rangeInputs=range ? Array.from(range.querySelectorAll('.ant-picker-input')) : [];
    const isRangeStart=rangeInputs.length===2 && rangeInputs[0]===anchor;
    // A range is one transaction. Closing after the first date rolls it back in Ant.
    const continuingRange=range && openDateRanges.has(range) && ownedChoiceLayer(anchor,visibleChoiceLayers());
    if (!continuingRange && !await dismissVisibleChoiceLayers()) {
      choiceFailureReasons.set(anchor,'choice-layer-close-blocked');
      if(typeof traceStep==='function')traceStep('date-blocked',anchor,null,{reason:'choice-layer-close-blocked',ok:false});
      return false;
    }
    const clickTarget=anchor.matches('.ant-picker-range .ant-picker-input') ? anchor.querySelector('input') : anchor;
    if (!safeCustomClick(clickTarget, !!range)) return false;
    const antDate = anchor.matches('.ant-picker,.ant-picker-range .ant-picker-input');
    if (antDate) await waitForControlState(() => !!ownedChoiceLayer(anchor, visibleChoiceLayers()), 1640);
    else await wait(140);
    let layers = visibleChoiceLayers();
    let layer = ownedChoiceLayer(anchor, layers);
    for (let attempt = 0; !antDate && !layer && attempt < 15; attempt++) {
      await wait(100);
      layer = ownedChoiceLayer(anchor, visibleChoiceLayers());
    }
    if (!layer) {if(typeof traceStep==='function')traceStep('date-layer',anchor,null,{ok:false});return false;}
    if(typeof traceStep==='function')traceStep('date-layer',anchor,null,{ok:true,range:!!range,start:isRangeStart});
    if(anchor.matches('.phoenix-select') && layer.matches('.phoenix-date-picker,.common-unmodeled-layer'))activeDatePopup={anchor,layer,closeAttempted:false};
    if (anchor.matches('.ant-picker,.ant-picker-range .ant-picker-input')) {
      let ok=false;
      try { ok=await fillAntCalendar(anchor, layer, m);if(typeof traceStep==='function')traceStep('date-picked',anchor,null,{ok,start:isRangeStart});return ok; }
      finally {
        if(ok && isRangeStart)openDateRanges.add(range);
        else {if(range)openDateRanges.delete(range);await dismissVisibleChoiceLayers();}
      }
    }
    if (layer && layer.querySelector('.phoenix-calendar-month-calendar')) {
      const ok = await fillPhoenixMonthPicker(anchor, layer, m);
      if (!ok && layer.isConnected && isVisible(layer)) await dismissVisibleChoiceLayers();
      return ok;
    }
    const inputSelector = '.phoenix-calendar-input,.ant-picker-input input,.el-date-editor input,.arco-picker input,input[placeholder*="日期"]';
    const input = Array.from(layer.querySelectorAll(inputSelector)).find(el => isVisible(el) && !el.disabled && !el.readOnly);
    const date = m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3] || '1');
    if (input && isVisible(input)) {
      setNativeValue(input, date);
      fireEnter(input);
      await wait(240);
      if (customControlMatchesValue(anchor, { type: 'date' }, date)) { await dismissVisibleChoiceLayers(); return true; }
    }
    if (layer.querySelector('.phoenix-calendar-date-panel')) {
      try { return await fillPhoenixDayPicker(anchor, layer, m); }
      finally { await dismissVisibleChoiceLayers(); }
    }
    const exact = layer.querySelector('[title="' + CSS.escape(date) + '"],[data-date="' + CSS.escape(date) + '"],[data-value="' + CSS.escape(date) + '"]');
    if (exact && isVisible(exact) && safeCustomClick(exact)) {
      await wait(180);
      if (customControlMatchesValue(anchor, { type: 'date' }, date)) return true;
    }
    if (layer && isVisible(layer)) await dismissVisibleChoiceLayers();
    return false;
  }

  async function fillAntCalendar(anchor, layer, match) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3] || 1);
    if (!Number.isInteger(year) || year < 1 || month < 1 || month > 12 || day < 1 || day > new Date(year,month,0).getDate()) return false;
    const wanted = year + '-' + pad2(month) + '-' + pad2(day);
    const panelNow = () => Array.from(layer.querySelectorAll('.ant-picker-panel')).find(isVisible) || layer;
    const cellsNow = panel => Array.from(panel.querySelectorAll('.ant-picker-cell[title]')).filter(isVisible);
    const modeNow = panel => panel.querySelector('.ant-picker-year-panel') ? 'year' : panel.querySelector('.ant-picker-month-panel') ? 'month' : 'date';
    const monthOnly = modeNow(panelNow()) === 'month';
    const allowed = node => node && isVisible(node) && !node.disabled && node.getAttribute('aria-disabled') !== 'true' && !node.classList.contains('ant-picker-cell-disabled');
    const signature = () => {
      const panel=panelNow();
      return modeNow(panel) + ':' + cellsNow(panel).map(cell=>cell.title).join('|');
    };
    const move = async button => {
      if (!allowed(button)) return false;
      const previous=signature();
      if (!safeCustomClick(button)) return false;
      return waitForControlState(() => signature() !== previous, 1200);
    };
    const navigation = (panel, selector) => {
      // Linked range panels expose backward/forward arrows on opposite sides.
      const buttons=Array.from(layer.querySelectorAll(selector)).filter(allowed);
      return buttons.length===1 ? buttons[0] : Array.from(panel.querySelectorAll(selector)).find(allowed);
    };
    for (let step = 0; step < 100; step++) {
      const panel=panelNow(),mode=modeNow(panel),cells=cellsNow(panel);
      const desired=mode==='year' ? String(year) : mode==='month' ? wanted.slice(0,7) : wanted;
      const exact=cells.filter(cell=>cell.title===desired);
      if (exact.length) {
        if (exact.length!==1 || !allowed(exact[0])) return false;
        const target=exact[0].querySelector('.ant-picker-cell-inner') || exact[0];
        if (!allowed(target)) return false;
        if (mode==='year' || (mode==='month' && !monthOnly)) {
          if (!await move(target)) return false;
          continue;
        }
        if (!safeCustomClick(target)) return false;
        return waitForControlState(() => anchor.isConnected !== false && Array.from(anchor.querySelectorAll('input')).some(input=>input.value===desired), 1520, 2);
      }
      const current=cells.find(cell=>cell.classList.contains('ant-picker-cell-in-view')) || cells[0];
      const date=current && /^(\d{4})(?:-(\d{2}))?/.exec(current.title);
      if (!date) return false;
      const currentYear=Number(date[1]);
      let button,direction=year<currentYear?'previous':'next';
      if (mode==='year') {
        // Year panels page by decades, so a distant birthday takes only a few clicks.
        button=navigation(panel,year<currentYear?'.ant-picker-header-super-prev-btn':'.ant-picker-header-super-next-btn');
      } else if (year!==currentYear && allowed(panel.querySelector('.ant-picker-year-btn'))) {
        button=panel.querySelector('.ant-picker-year-btn');
      } else if (mode==='date' && year===currentYear && Number(date[2])!==month && allowed(panel.querySelector('.ant-picker-month-btn'))) {
        button=panel.querySelector('.ant-picker-month-btn');
      } else {
        // Older Ant-like widgets may expose only arrows; retain their bounded fallback.
        const delta=(year-currentYear)*12+month-Number(date[2] || 1);
        if (!delta) return false;
        direction=delta<0?'previous':'next';
        const selector=mode==='month'||Math.abs(delta)>=12 ? (delta<0?'.ant-picker-header-super-prev-btn':'.ant-picker-header-super-next-btn') : (delta<0?'.ant-picker-header-prev-btn':'.ant-picker-header-next-btn');
        button=navigation(panel,selector);
      }
      if(typeof traceStep==='function')traceStep('date-navigation',anchor,null,{step,count:button?1:0,direction});
      if (!await move(button)) return false;
    }
    return false;
  }

  async function fillPhoenixDayPicker(anchor, layer, match) {
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3] || 1);
    if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return false;
    const read = () => {
      const y = Number((layer.querySelector('.phoenix-calendar-year-select')?.textContent.match(/\d{4}/) || [0])[0]);
      const m = Number((layer.querySelector('.phoenix-calendar-month-select')?.textContent.match(/\d+/) || [0])[0]);
      return {year:y, month:m};
    };
    for (let step = 0; step < 100; step++) {
      const current = read();
      if (!current.year || !current.month) return false;
      if (current.year === year && current.month === month) {
        const cells = Array.from(layer.querySelectorAll('.phoenix-calendar-cell'));
        const cell = cells.find(el => !/last-month|next-month|disabled/.test(el.className) && String(el.textContent).trim() === String(day));
        const target = cell && (cell.querySelector('.phoenix-calendar-date') || cell);
        if (!target || target.getAttribute('aria-disabled') === 'true' || !safeCustomClick(target)) return false;
        for (let retry = 0; retry < 15; retry++) {
          await wait(100);
          if (customControlMatchesValue(anchor, {type:'date'}, year + '-' + pad2(month) + '-' + pad2(day))) return true;
        }
        return false;
      }
      const direction = current.year !== year ? (current.year > year ? 'prev-year' : 'next-year') : (current.month > month ? 'prev-month' : 'next-month');
      if (!safeCustomClick(layer.querySelector('.phoenix-calendar-' + direction + '-btn'))) return false;
      let changed = false;
      for (let retry = 0; retry < 15; retry++) {
        await wait(80);
        const next = read();
        if (next.year !== current.year || next.month !== current.month) {changed=true;break;}
      }
      if (!changed) return false;
    }
    return false;
  }

  function customSearchInput(anchor, layer) {
    const selector = 'input:not([type="hidden"]),textarea';
    const inputs = [];
    if (layer && layer.querySelectorAll) inputs.push(...layer.querySelectorAll(selector));
    if (anchor && anchor.querySelectorAll) inputs.push(...anchor.querySelectorAll(selector));
    return inputs.find(input => isVisible(input) && !input.disabled && !input.readOnly) || null;
  }

  const choiceFailureReasons = new WeakMap();
  const pendingChoiceExperience = new WeakMap();

  function choiceExperienceKey(anchor,field) {
    // Store structural strategy only: never the source value, option text, key or résumé.
    return JSON.stringify([location.hostname,field.key||field.label,anchor.tagName,
      Array.from(anchor.classList).filter(c=>!/(active|focus|open|selected)/i.test(c)).sort().join(' ').slice(0,200)]);
  }

  async function replayChoiceExperience(anchor,field,value,layer) {
    if(!activeFillRun || !activeFillRun.useAI)return false;
    try{
      const key=choiceExperienceKey(anchor,field);
      const stored=await chrome.storage.local.get('choiceExperiences');
      const entries=stored.choiceExperiences||{};
      const item=entries[key];
      if(!item)return false;
      const input=customSearchInput(anchor,layer);
      if(item.type!=='search-prefix' || Date.now()-item.verifiedAt>30*86400000 || !Number.isInteger(item.length) || item.length<2 || item.length>=String(value).length || !input){
        delete entries[key];await chrome.storage.local.set({choiceExperiences:entries});return false;
      }
      checkFillRun();
      if(ownedChoiceLayer(anchor,visibleChoiceLayers())!==layer)return false;
      setNativeValue(input,String(value).slice(0,item.length));
      pendingChoiceExperience.set(anchor,{key,entry:item});
      await wait(350);return true;
    }catch(error){checkFillRun();return false;}
  }

  async function finishChoiceExperience(anchor,ok) {
    const pending=pendingChoiceExperience.get(anchor);
    pendingChoiceExperience.delete(anchor);
    if(!pending)return;
    try{
      const stored=await chrome.storage.local.get('choiceExperiences');
      const entries=stored.choiceExperiences||{};
      delete entries[pending.key];
      if(ok)entries[pending.key]={...pending.entry,verifiedAt:Date.now()};
      const bounded=Object.fromEntries(Object.entries(entries).sort((a,b)=>b[1].verifiedAt-a[1].verifiedAt).slice(0,100));
      await chrome.storage.local.set({choiceExperiences:bounded});
    }catch(error){/* Storage failure must not change the fill result. */}
  }

  async function adaptChoiceWithAi(anchor, field, value, summaryLayer) {
    if (!activeFillRun || !activeFillRun.useAI || activeFillRun.adaptationCalls >= 8) return null;
    const layer=ownedChoiceLayer(anchor,visibleChoiceLayers());
    if (!layer || layer!==summaryLayer) return null;
    const nodes=Array.from(layer.querySelectorAll(OPTION_SELECTOR)).filter(el=>isVisible(el)&&!el.matches('[disabled],[aria-disabled="true"]')&&!/disabled/i.test(String(el.className))).slice(0,40);
    const options=nodes.map((el,index)=>({id:String(index),text:String(el.textContent||'').trim().slice(0,160)})).filter(o=>o.text);
    activeFillRun.adaptationCalls++;
    try {
      const response=await diagnosticAiRequest({type:'AI_ADAPT_CHOICE',payload:{label:field.label,target:String(value).slice(0,300),options,canSearch:!!customSearchInput(anchor,layer)}},15000);
      checkFillRun();
      if(!response || !response.ok || !response.action)return null;
      const action=response.action;
      if(action.type==='search'){
        const query=String(action.query||'').trim();
        // Search is restricted to a substring of the source, never arbitrary model text.
        if(query.length<2 || !String(value).includes(query))return null;
        const input=customSearchInput(anchor,layer);if(!input)return null;
        if(String(value).startsWith(query) && query.length<String(value).length)
          pendingChoiceExperience.set(anchor,{key:choiceExperienceKey(anchor,field),entry:{type:'search-prefix',length:query.length}});
        setNativeValue(input,query);await wait(350);
        return {retry:true};
      }
      if(action.type!=='select' || !Number.isFinite(action.confidence) || action.confidence<0.9){if(typeof traceStep==='function')traceStep('ai-action-rejected',anchor,field,{reason:action.type==='stop'?'model-stop':'low-confidence'});return null;}
      const index=options.findIndex(o=>o.id===String(action.optionId));if(index<0){if(typeof traceStep==='function')traceStep('ai-action-rejected',anchor,field,{reason:'invalid-option-id'});return null;}
      const option=options[index],el=nodes[Number(option.id)];
      // Only resolve close/ambiguous source matches; unsupported semantic leaps remain manual.
      if(!choiceTextScore(option.text,valueCandidates(field,value),false)){if(typeof traceStep==='function')traceStep('ai-action-rejected',anchor,field,{reason:'source-mismatch'});return null;}
      if(!el.isConnected || !isVisible(el) || el.textContent.trim().slice(0,160)!==option.text){if(typeof traceStep==='function')traceStep('ai-action-rejected',anchor,field,{reason:'stale-option'});return null;}
      if(ownedChoiceLayer(anchor,visibleChoiceLayers())!==layer){if(typeof traceStep==='function')traceStep('ai-action-rejected',anchor,field,{reason:'ownership-changed'});return null;}
      return {el,text:option.text,score:1};
    } catch(error){checkFillRun();return null;}
  }

  async function settleCustomChoice(anchor, field, value) {
    const layers = visibleChoiceLayers();
    const layer = ownedChoiceLayer(anchor, layers);
    if (layers.length && !layer) {
      choiceFailureReasons.set(anchor, 'choice-layer-close-blocked');
      await finishChoiceExperience(anchor, false); return false;
    }
    const antSelect = !!anchor.matches?.('.ant-select');
    // A selected Ant option can commit before its leave animation finishes.
    // Wait for automatic closure before sending Escape or toggling the anchor.
    if (layer && antSelect) await waitForControlState(() => !isVisible(layer), 520);
    if (layer && isVisible(layer)) {
      // Close the owning control, never re-click a selected (possibly multi-select) option.
      const target = anchor.contains(document.activeElement) ? document.activeElement : anchor;
      target.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',code:'Escape',bubbles:true}));
      if (antSelect) await waitForControlState(() => !isVisible(layer), 520);
      else await wait(80);
      if (isVisible(layer) && anchor.isConnected) {
        safeCustomClick(anchor);
        if (antSelect) await waitForControlState(() => !isVisible(layer), 520);
        else await wait(140);
      }
      if (isVisible(layer) || visibleChoiceLayers().length) {
        choiceFailureReasons.set(anchor, 'choice-layer-close-blocked');
        await finishChoiceExperience(anchor, false); return false;
      }
    }
    if (visibleChoiceLayers().length) {
      choiceFailureReasons.set(anchor, 'choice-layer-close-blocked');
      await finishChoiceExperience(anchor, false); return false;
    }
    const ok = anchor.isConnected && customControlMatchesValue(anchor, field, value);
    if (!ok) choiceFailureReasons.set(anchor, 'target-mismatch');
    await finishChoiceExperience(anchor, ok); return ok;
  }

  async function fillCustomSelect(anchor, field, value) {
    choiceFailureReasons.set(anchor, 'choice-open-failed');
    if (field && field.type === 'date') {
      const ok=await fillCustomDate(anchor,value);
      // Ant ranges are committed by their end-date task, never close the start here.
      if(anchor.closest('.ant-picker-range'))return ok;
      const closed=await dismissVisibleChoiceLayers();
      if(!closed){choiceFailureReasons.set(anchor,'choice-layer-close-blocked');return false;}
      if(!ok)return false;
      if(!customDateMatchesTarget(anchor,value)){choiceFailureReasons.set(anchor,'target-mismatch');return false;}
      return true;
    }
    if (!await dismissVisibleChoiceLayers()) {
      choiceFailureReasons.set(anchor,'choice-layer-close-blocked');
      if(typeof traceStep==='function')traceStep('choice-blocked',anchor,field,{reason:'choice-layer-close-blocked',ok:false});
      return false;
    }
    if(typeof traceStep==='function')traceStep('choice-open',anchor,field);
    const antSelect = !!anchor.matches?.('.ant-select');
    if(antSelect) {
      const trigger=anchor.querySelector('.ant-select-selector');
      if(!trigger || !isVisible(trigger))return false;
      checkFillRun();
      programmaticFill=true;
      try {
        trigger.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,buttons:1,view:window}));
        trigger.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,button:0,view:window}));
        trigger.click();
        anchor.querySelector('input')?.focus({preventScroll:true});
      } finally {programmaticFill=false;}
    } else if (!safeCustomClick(anchor.matches('.ud__select') ? anchor.querySelector('.ud__select__selector') : anchor)) return false;
    if (antSelect) await waitForControlState(() => !!ownedChoiceLayer(anchor, visibleChoiceLayers()), 960);
    else await wait(140);

    let layers = visibleChoiceLayers();
    for (let attempt = 0; !antSelect && !layers.length && attempt < 10; attempt++) {
      await wait(80);
      layers = visibleChoiceLayers();
    }
    let layer = ownedChoiceLayer(anchor, layers);
    if(typeof traceStep==='function')traceStep('choice-layer',anchor,field,{count:layers.length,ok:!!layer});
    if (!layer) { choiceFailureReasons.set(anchor, 'choice-layer-unresolved'); await dismissVisibleChoiceLayers(); return false; }
    if (layer.querySelector('.area-selector-container')) return fillAreaSelector(anchor, layer, field, value);

    const candidates = valueCandidates(field, value);
    const placeAware = !!(field && (field.key === 'household' || field.key === 'expectedCity'));
    const seen = new Set();
    let clicked = false;
    let searched = false;
    await replayChoiceExperience(anchor,field,value,layer);

    for (let step = 0; step < 6; step++) {
      let best = bestVisibleOption(layer, candidates, placeAware, seen);
      if (!best && !searched) {
        const search = customSearchInput(anchor, layer);
        if (search) {
          setNativeValue(search, value);
          if(typeof traceStep==='function')traceStep('choice-search',anchor,field,{sourcePresent:!!value});
          searched = true;
        }
      }
      if (!best) {
        const ready = await waitForChoiceOption(anchor, candidates, placeAware, seen);
        if (ready) { layer = ready.layer; best = ready.best; }
      }
      if (!best && activeFillRun && activeFillRun.useAI && step<2) {
        const adapted=await adaptChoiceWithAi(anchor,field,value,layer);
        if(adapted && adapted.retry)continue;
        if(adapted)best=adapted;
      }
      if (!best) {
        const visible=Array.from(layer.querySelectorAll(OPTION_SELECTOR)).filter(isVisible);
        const matched=visible.filter(node=>choiceTextScore(node.textContent,candidates,placeAware)>0);
        const failureReason=!visible.length?'no-visible-options':!matched.length?'no-matching-options':'ambiguous-options';
        if(typeof traceStep==='function')traceStep('choice-match-failed',anchor,field,{count:visible.length,matchedCount:matched.length,reason:failureReason});
        choiceFailureReasons.set(anchor, failureReason); break;
      }
      if(typeof traceStep==='function')traceStep('choice-candidate',anchor,field,{count:layer.querySelectorAll(OPTION_SELECTOR).length,score:best.score});
      seen.add(normalize(best.text));
      if (!safeCustomClick(optionClickTarget(best.el))) break;
      clicked = true;
      if(typeof traceStep==='function')traceStep('choice-clicked',anchor,field,{matchesTarget:customControlMatchesValue(anchor,field,value)});
      choiceFailureReasons.set(anchor, 'choice-not-committed');
      if (antSelect && !placeAware) {
        await waitForControlState(() => customControlMatchesValue(anchor, field, value) || !ownedChoiceLayer(anchor, visibleChoiceLayers()), 160);
      } else await wait(140);
      layers = visibleChoiceLayers();
      if (!layers.length) break;
      layer = ownedChoiceLayer(anchor, layers);
      if (!layer) break;
      if (!placeAware) break;
    }

    if (clicked && await confirmChoiceSelection(anchor, field, value)) {
      if (antSelect && !placeAware) {
        // This is a readiness check, not proof against delayed rollback. Keep the
        // run settlement window and final target verification below unchanged.
        await waitForControlState(() => anchor.isConnected && customControlMatchesValue(anchor, field, value), 360, 2);
      } else await wait(350);
      if(customControlMatchesValue(anchor,field,value)){if(typeof traceStep==='function')traceStep('choice-confirmed',anchor,field,{matchesTarget:true});return settleCustomChoice(anchor,field,value);}
    }
    if (!clicked && layer && isVisible(layer)) await dismissVisibleChoiceLayers();
    for (let attempt = 0; clicked && attempt < 10; attempt++) {
      await wait(80);
      if (customControlMatchesValue(anchor, field, value)) return settleCustomChoice(anchor,field,value);
    }
    await dismissVisibleChoiceLayers();
    await finishChoiceExperience(anchor,false);
    return false;
  }

  async function fillAreaSelector(anchor, layer, field, value) {
    let remaining = String(value || '').replace(/[\s/＞>、,，-]/g, '');
    const path = [];
    try {
      for (let depth = 0; depth < 6; depth++) {
        let matches=[];
        // A parent can disappear before the next level's network response arrives.
        for(let attempt=0;attempt<20;attempt++){
          const items=Array.from(layer.querySelectorAll('.area-data-container .area-item-container')).filter(isVisible);
          matches=items.map(el=>({el,label:String(el.querySelector('.area-text-label')?.textContent||'').trim()}))
            .filter(item=>item.label && remaining.startsWith(item.label));
          if(matches.length)break;
          await wait(80);
        }
        matches.sort((a, b) => b.label.length - a.label.length);
        if (!matches.length) return false;
        const match = matches[0];
        remaining = remaining.slice(match.label.length);
        path.push(match.label);
        if (remaining) {
          const arrow = match.el.querySelector('.area-icon-right.visible');
          if (!arrow || !safeCustomClick(match.el.querySelector('.area-text-label'))) return false;
          let changed = false;
          for (let attempt = 0; attempt < 20; attempt++) {
            await wait(80);
            if (!match.el.isConnected) { changed = true; break; }
            const labels = Array.from(layer.querySelectorAll('.area-data-container .area-text-label')).map(el => el.textContent.trim());
            if (labels.some(label => remaining.startsWith(label))) { changed = true; break; }
          }
          if (!changed) return false;
        } else {
          if (field.key === 'household' && match.el.querySelector('.area-icon-right.visible')) return false;
          if (!safeCustomClick(match.el.querySelector('.icon-container svg') || match.el.querySelector('.icon-container'))) return false;
          await wait(150);
          const selected = layer.querySelector('.select-data-container');
          if (!selected || !selected.textContent.includes(match.label)) return false;
          const confirm = exactLayerButton(layer, ['确定', '确认']);
          if (!confirm || !safeCustomClick(confirm)) return false;
          for (let attempt = 0; attempt < 15; attempt++) {
            await wait(80);
            if (customControlValueTexts(anchor).some(text => path.every(label => text.includes(label)))) return true;
          }
          return false;
        }
      }
      return false;
    } finally {
      await dismissVisibleChoiceLayers();
    }
  }

  async function fillCustomRadio(anchor, value, field) {
    if (!await dismissVisibleChoiceLayers()) return false;
    const candidates = valueCandidates(field, value);
    const selector = [
      '.phoenix-radio-group__radioItem', '[role="radio"]', '.ant-radio-wrapper',
      '.el-radio', '.arco-radio', '.ivu-radio-wrapper', 'label'
    ].join(',');
    let best = null;
    for (const item of anchor.querySelectorAll(selector)) {
      if (!isVisible(item)) continue;
      const score = choiceTextScore(item.textContent, candidates, false);
      if (score && (!best || score > best.score)) best = { el: item, score: score };
    }
    const target = best && (best.el.querySelector('.phoenix-radio__circle-wrapper') || best.el.querySelector('.phoenix-radio,[type="radio"]') || best.el);
    if (!target || !safeCustomClick(target)) return false;
    for (let attempt = 0; attempt < 10; attempt++) {
      await wait(80);
      if (customControlMatchesValue(anchor, field, value)) return true;
    }
    return false;
  }

  async function fillAutocomplete(input, value, field, opts) {
    const phoenix=!!input.closest('.phoenix-auto-complete-container');
    if(phoenix && !(opts && opts.auto) && !await dismissVisibleChoiceLayers())return false;
    setNativeValue(input, value);
    if (opts && opts.auto) return true;
    if(phoenix){
      // Remote school suggestions may arrive after blur. Wait for a matching
      // candidate, then finish this input's popup before starting the next field.
      const ready=await waitForChoiceOption(input,valueCandidates(field,value),false,new Set());
      const layer=ready?.layer || ownedChoiceLayer(input,visibleChoiceLayers());
      if(ready){safeCustomClick(optionClickTarget(ready.best.el),true);await wait(80);}
      if(document.activeElement===input)input.blur();
      if(layer && isVisible(layer)){
        // Observed Phoenix outside-mousedown contract: use this field's inert
        // label, never arbitrary page actions or another control's candidate.
        const label=input.closest('.form-item')?.querySelector('.form-item__text');
        if(!label || !safeCustomClick(label,true))return false;
        await waitForControlState(()=>!isVisible(layer),400);
      }
      return input.isConnected && input.value===String(value) && !visibleChoiceLayers().length;
    }
    await wait(180);
    const layers = visibleChoiceLayers();
    const layer = layers[layers.length - 1];
    if (!layer) return true;
    const best = bestVisibleOption(layer, valueCandidates(field, value), false, new Set());
    if (best) {
      safeCustomClick(optionClickTarget(best.el));
      await wait(80);
    }
    return true;
  }

  function fillSelect(sel, field, value) {
    const candidates = valueCandidates(field, value);
    if (!candidates.length) return false;
    let best = null;
    for (const opt of Array.from(sel.options)) {
      if (opt.disabled) continue;
      const score = choiceTextScore(opt.textContent || opt.value, candidates, false);
      if (score && (!best || score > best.score)) best = { opt: opt, score: score };
    }
    return best ? setNativeValue(sel, best.opt.value) : false;
  }

  function fillMultiSelect(sel, field, values) {
    const requested = values.flatMap(value => String(value).split(/[、,，;；\n]/)).map(v => v.trim()).filter(Boolean);
    if (!requested.length) return false;
    const selected = new Set();
    for (const value of requested) {
      const candidates = valueCandidates(field, value);
      const matches = Array.from(sel.options).filter(opt => !opt.disabled && !(opt.parentElement && opt.parentElement.disabled))
        .map(opt => ({ opt, score: choiceTextScore(opt.textContent || opt.value, candidates, false) }))
        .filter(match => match.score > 0).sort((a, b) => b.score - a.score);
      if (!matches.length || (matches[1] && matches[1].score === matches[0].score)) return false;
      selected.add(matches[0].opt);
    }
    // Resolve the entire set before mutating, so a missing option leaves the old selection intact.
    for (const opt of Array.from(sel.options)) opt.selected = selected.has(opt);
    fireEvents(sel);
    return Array.from(sel.options).every(opt => opt.selected === selected.has(opt));
  }

  async function verifyControlWrite(el, expected, alreadySettled = false) {
    if (!alreadySettled) await wait(100);
    if (!el.isConnected) return 'control-replaced';
    if (el.validity && !el.validity.valid) return 'validation-rejected';
    if (el.tagName === 'SELECT' && el.multiple) {
      const actual = Array.from(el.options).filter(opt => opt.selected).map(opt => opt.value);
      return JSON.stringify(actual) === JSON.stringify(expected) ? '' : 'value-reverted';
    }
    const actual = el.getAttribute('contenteditable') === 'true' ? el.textContent : el.value;
    return String(actual) === String(expected) ? '' : 'value-reverted';
  }

  function fillRadio(anchor, value, field) {
    const synonyms = (field && field.options && field.options[value]) || [];
    const cands = [normalize(value)].concat(synonyms.map(normalize)).filter(Boolean);
    for (const r of radioGroupOf(anchor)) {
      const texts = [];
      if (r.id) {
        const l = document.querySelector('label[for="' + CSS.escape(r.id) + '"]');
        if (l) texts.push(l.textContent);
      }
      const wrap = r.closest('label');
      if (wrap) texts.push(wrap.textContent);
      texts.push(r.getAttribute('aria-label'), r.title, r.value);
      if (r.nextElementSibling) texts.push(r.nextElementSibling.textContent);
      if (r.previousElementSibling) texts.push(r.previousElementSibling.textContent);
      for (const t of texts) {
        const n = normalize(t);
        if (n && cands.some(c => n === c || (c.length >= 2 && n.indexOf(c) >= 0))) {
          r.checked = true;
          fireEvents(r);
          return true;
        }
      }
    }
    return false;
  }

  function fillDate(el, value) {
    const m = String(value).match(/(\d{4})\s*[-年/.]\s*(\d{1,2})(?:\s*[-月/.]\s*(\d{1,2}))?/);
    if (!m) return false;
    const type = inputType(el);
    const date = m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3] || '1');
    if (type === 'month') return setNativeValue(el, date.slice(0, 7));
    if (type === 'datetime-local') return setNativeValue(el, date + 'T00:00');
    return setNativeValue(el, date);
  }

  function fillContentEditable(el, value) {
    el.textContent = String(value == null ? '' : value);
    fireEvents(el);
    return true;
  }

  const filledByUs = new WeakMap();
  const verifiedControlsBySummary = new WeakMap();
  let lastSelfCheck = null;
  function diagnosticState(el){
    // Fast, in-memory state signature. Final validation still uses auditValue/isVisible.
    if(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.tagName==='SELECT')return String(el.value||'')+'|'+!!el.checked;
    return JSON.stringify(Array.from(el.querySelectorAll('input,textarea,[aria-selected="true"],[aria-checked="true"],.ant-select-selection-item')).map(node=>[node.value||node.textContent||'',!!node.checked]));
  }
  function auditValue(el) {
    if (isRadio(el)) return JSON.stringify(radioGroupOf(el).filter(r => r.checked).map(r => r.value));
    if (isCustomSelect(el) || isCustomRadioGroup(el)) return JSON.stringify(customControlValueTexts(el));
    if (el.tagName === 'SELECT' && el.multiple) return JSON.stringify(Array.from(el.selectedOptions).map(o => o.value));
    return String(el.getAttribute('contenteditable') === 'true' ? el.textContent : el.value || '');
  }
  function auditInvalid(el) {
    if (el.validity && !el.validity.valid) return true;
    const row = el.closest('.form-item,.el-form-item,.ant-form-item') || el;
    return Array.from(row.querySelectorAll('[aria-invalid="true"],.el-form-item__error,.ant-form-item-explain-error,.phoenix-formItem__error'))
      .some(isVisible) || el.getAttribute('aria-invalid') === 'true';
  }
  function auditMatchesTarget(record){
    const {el,field,expectedValues=[]}=record;
    if(!expectedValues.length)return false;
    if(field.type==='date')return expectedValues.some(value=>customDateMatchesTarget(el,value));
    if(isCustomSelect(el)||isCustomRadioGroup(el))return expectedValues.some(value=>customControlMatchesValue(el,field,value));
    // Native choices were resolved to option values during writing; compare that
    // committed snapshot, since source labels need not equal the option's value.
    if(el.tagName==='SELECT'||isRadio(el))return record.after===auditValue(el);
    const actual=String(el.getAttribute('contenteditable')==='true'?el.textContent:el.value||'');
    return expectedValues.some(value=>actual===String(value));
  }

  function customDateMatchesTarget(el,value){
    if(el.matches?.('.ud__picker-input[placeholder="YYYY"]')) {
      const target=String(value).match(/^(\d{4})(?:[-年/.]\d{1,2}(?:[-月/.]\d{1,2})?)?$/);
      return !!target && +target[1]>0 && String(el.value||'').trim()===target[1];
    }
    const parts=text=>{
      const result=String(text||'').trim().match(/^(\d{4})\s*[-年/.]\s*(\d{1,2})(?:\s*[-月/.]\s*(\d{1,2}))?\s*[月日]?$/);
      if(!result || +result[1]<1 || +result[2]<1 || +result[2]>12)return null;
      if(result[3] && (+result[3]<1 || +result[3]>new Date(+result[1],+result[2],0).getDate()))return null;
      return result;
    };
    const target=parts(value);if(!target)return false;
    const texts=isCustomSelect(el)?customControlValueTexts(el):[el.value];
    return texts.some(text=>{const actual=parts(text);return actual && +actual[1]===+target[1] && +actual[2]===+target[2] && (!target[3]||+actual[3]===+target[3]);});
  }

  async function runSelfCheck(summary) {
    activeFillRun.phase = 'self-check';
    const records = activeFillRun.auditRecords || [];
    const hadOpenChoices=visibleChoiceLayers().length>0;
    await dismissVisibleChoiceLayers();
    // Plain native fields have already passed their shorter settlement window.
    // Keep the extra UI-settle delay only for widgets that can commit after closing.
    const needsComponentSettle=hadOpenChoices||records.some(r=>isCustomSelect(r.el)||isCustomRadioGroup(r.el)||r.el.closest?.('.ant-picker,.el-date-editor,.arco-picker,.phoenix-datepicker'));
    // A complete, unchanged five-second observation already covers component
    // settling. Closing a newly open layer or any changed/replaced control
    // invalidates that evidence; retain the original fallback delay in that case.
    const observed = activeFillRun.settledControls;
    const canReuseSettlement = !hadOpenChoices && observed && records.length
      && records.every(r=>r.el.isConnected && observed.has(r.el) && observed.get(r.el)===auditValue(r.el));
    if(needsComponentSettle && !canReuseSettlement)await wait(800);
    const initial = new Map(records.map(r => [r.el, auditValue(r.el)]));
    await wait(400);
    const targets = new Map(), items = [], seen = new Set();
    function add(el, label, status, reason, fieldKey) {
      const id = 'field-' + (items.length + 1);
      const knownKey = typeof FIELDS !== 'undefined' && FIELDS.some(f=>f.key===fieldKey) ? fieldKey : 'unmapped';
      targets.set(id, el); items.push({id,label:String(label || '未命名字段').slice(0,100),status,reason,fieldKey:knownKey});
      if(typeof traceStep==='function')traceStep('final-check',el,FIELDS.find(f=>f.label===label),{reason,ok:status==='verified'});
    }
    for (const r of records) {
      if (seen.has(r.el)) continue;
      seen.add(r.el);
      let status = 'verified', reason = 'stable-match';
      if (!r.el.isConnected || !isVisible(r.el)) {status='manual';reason='control-replaced';}
      else if (auditInvalid(r.el)) {status='failed';reason='validation-rejected';}
      else if (r.skipped) {status='manual';reason='existing-unverified';}
      else if (!r.verified) {status='failed';reason=r.failureReason || 'not-verified';}
      else if (initial.get(r.el) !== auditValue(r.el) || r.after !== auditValue(r.el)) {status='failed';reason='value-reverted';}
      else if (!controlHasValue(r.el)) {status='failed';reason='empty-after-fill';}
      else if (!auditMatchesTarget(r)) {status='failed';reason='target-mismatch';}
      add(r.el,r.field.label,status,reason,r.field.key);
    }
    for (const el of collectControls(true)) {
      if (seen.has(el)) continue;
      const label = bestLabelTextFrom(getTextCandidates(el)) || '未命名字段';
      const missing = !controlHasValue(el) && (summary.missingData || []).includes(label);
      add(el,label,missing?'missing':'manual',missing?'missing-source':controlHasValue(el)?'existing-unverified':'unmapped-or-empty');
    }
    const counts = Object.fromEntries(['verified','failed','missing','manual'].map(s => [s,items.filter(i => i.status === s).length]));
    const report = {at:new Date().toISOString(),counts,items,scope:'current-frame',persistence:'not-tested',validation:'native-and-known-inline-errors',openLayers:visibleChoiceLayers().length};
    lastSelfCheck = {report,targets};
    return report;
  }

  function comparePagePosition(a, b, positions) {
    const ar = positions?.get(a) || a.getBoundingClientRect(), br = positions?.get(b) || b.getBoundingClientRect();
    if (Math.abs(ar.top - br.top) > 4) return ar.top - br.top;
    if (ar.left !== br.left) return ar.left - br.left;
    return a === b ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  }

  // Keep the current work visible without moving a page that the user is reading.
  // A manual scroll pauses this assistance briefly; it never changes a field's focus.
  function followCurrentField(el) {
    const run = activeFillRun;
    if (!run || run.cleaning || !el || !el.isConnected || Date.now() < (run.followPausedUntil || 0)) return;
    const target = el.closest?.('.ant-form-item, .el-form-item, .form-item, .form-group, [role="group"]') || el;
    if (!target.scrollIntoView) return;
    const rect = target.getBoundingClientRect?.();
    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
    const comfortablyVisible = rect && viewportHeight && rect.top >= 96 && rect.bottom <= viewportHeight - 96;
    if (comfortablyVisible) return;
    const now = Date.now();
    if (run.lastFollowedTarget === target && now - (run.lastFollowedAt || 0) < 220) return;
    run.lastFollowedTarget = target;
    run.lastFollowedAt = now;
    target.scrollIntoView({block:'center', inline:'nearest', behavior:'smooth'});
  }

  function pauseFillFollow() {
    if (activeFillRun && !activeFillRun.cleaning) activeFillRun.followPausedUntil = Date.now() + 1500;
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('wheel', pauseFillFollow, {capture:true, passive:true});
    document.addEventListener('touchstart', pauseFillFollow, {capture:true, passive:true});
    document.addEventListener('keydown', event => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) pauseFillFollow();
    }, true);
  }

  async function executeFillPlan(plan, overwrite, summary, opts) {
    const pending = plan.slice();
    const initiallyNonempty = new Set(plan.filter(task => controlHasValue(task.el)).map(task => task.el));
    const rangeTasks=[];
    while (pending.length) {
      checkFillRun();
      // Re-read geometry after each committed control, since dependent fields can move.
      const positions = new Map(pending.map(task => [task.el, task.el.getBoundingClientRect()]));
      pending.sort((a, b) => comparePagePosition(a.el, b.el, positions));
      const task = pending.shift();
      const range = task.el.closest?.('.ant-picker-range');
      const rangeEnd = range?.querySelectorAll('.ant-picker-input')[1];
      // Ant may render a provisional end while our start transaction is open.
      // Complete only our initially empty end; never replace pre-existing data.
      const completeOwnRange = range && openDateRanges.has(range) && task.el === rangeEnd && !initiallyNonempty.has(task.el);
      const taskOverwrite = overwrite || !!completeOwnRange;
      if(typeof traceStep==='function')traceStep('task-start',task.el,task.field,{sourcePresent:task.values.some(v=>String(v).trim()),route:task.ai?'ai':'rule'});
      let auditRecord;
      if (activeFillRun) {
        auditRecord = {el:task.el,field:task.field,expectedValues:task.values.slice(),before:auditValue(task.el),verified:false,skipped:!taskOverwrite && controlHasValue(task.el)};
        (activeFillRun.auditRecords ||= []).push(auditRecord);
      }
      if (activeFillRun) Object.assign(activeFillRun, {phase:'filling', field:task.field.label, total:plan.length, completed:plan.length - pending.length - 1});
      if (!task.el.isConnected || !isVisible(task.el)) {
        summary.failed.push(task.field.label);
        if (!summary.diagnostics) summary.diagnostics = [];
        summary.diagnostics.push({field:task.field.key, status:'failed', reason:'control-replaced'});
        continue;
      }
      followCurrentField(task.el);
      const before = summary.filled.length;
      const diagnosticsBefore = (summary.diagnostics || []).length;
      // Keep one serial post-blur boundary for plain native fields. Widgets,
      // autocomplete and date inputs retain their own commit protocol.
      const settleNativeAfterBlur = !!activeFillRun?.selfCheck && !opts?.auto
        && task.field.type !== 'date' && !isAutocompleteInput(task.el)
        && !isCustomSelect(task.el) && !isCustomRadioGroup(task.el)
        && (task.el.tagName === 'TEXTAREA' || (task.el.tagName === 'INPUT'
          && ['text','email','tel','url','number'].includes(inputType(task.el))))
        && !task.el.matches('[role="combobox"],[aria-autocomplete],[list]');
      await applyControl(task.el, task.field, task.values, taskOverwrite, summary, {auto:!!(opts && opts.auto), settleNativeAfterBlur});
      if(typeof traceStep==='function')traceStep('write-result',task.el,task.field,{ok:summary.filled.length>before});
      if (auditRecord) {
        // Only this task's appended diagnostics belong to this exact control.
        // Field labels alone cannot distinguish repeated education rows.
        auditRecord.failureReason = (summary.diagnostics || []).slice(diagnosticsBefore).find(d => d.status === 'failed')?.reason;
        auditRecord.after = auditValue(task.el);
        auditRecord.diagnosticWritten=diagnosticState(task.el);
        auditRecord.lastObserved=auditRecord.diagnosticWritten;
        auditRecord.verified = summary.filled.length > before;
        const focused=document.activeElement;
        if(focused && task.el.contains(focused) && !task.el.closest('.ant-picker-range')){
          focused.blur();await wait(120);
          traceStep('blur-check',task.el,task.field,{sameAsWritten:auditRecord.after===auditValue(task.el)});
        }
        if(Date.now()-(activeFillRun.lastCheckpoint||0)>8000)await persistRunCheckpoint(activeFillRun,summary);
        for(const earlier of activeFillRun.auditRecords){
          const current=diagnosticState(earlier.el);
          if(current!==earlier.lastObserved || !earlier.el.isConnected){
            traceStep('value-transition',earlier.el,earlier.field,{sameAsWritten:current===earlier.diagnosticWritten,afterControl:activeFillRun.traceIds?.get(task.el)||0});
            earlier.lastObserved=current;
          }
        }
      }
      if(task.el.closest?.('.ant-picker-range') && summary.filled.length>before)rangeTasks.push({task,auditRecord});
      if (task.ai && summary.filled.length > before) summary.aiFilled.push(task.field.label);
    }
    if(rangeTasks.length){
      await wait(350);
      for(const {task,auditRecord} of rangeTasks){
        const range=task.el.closest('.ant-picker-range');
        const values=range && Array.from(range.querySelectorAll('.ant-picker-input input')).map(el=>el.value);
        const valid=task.el.isConnected && values && values.length===2 && values.every(Boolean) && values[0]<=values[1]
          && task.values.some(v=>customControlMatchesValue(task.el,task.field,v)) && !auditInvalid(task.el);
        if(!valid){
          const index=summary.filled.indexOf(task.field.label);if(index>=0)summary.filled.splice(index,1);
          summary.failed.push(task.field.label);
          (summary.diagnostics ||= []).push({field:task.field.key,status:'failed',reason:'date-range-not-committed'});
          if(auditRecord)auditRecord.verified=false;
        }
      }
    }
    checkFillRun();
    if (activeFillRun) activeFillRun.completed = plan.length;
  }

  async function applyControl(el, field, values, overwrite, summary, opts) {
    if(activeFillRun?.siteEducationRestricted && REPEAT_GROUPS[0].fieldKeys.includes(field.key) && !activeFillRun.siteRecordControls?.has(el))return;
    checkFillRun();
    const decision=activeFillRun?.pageDecisions?.get(el);
    if(decision && (decision.status!=='mapped' || decision.fieldKey!==field.key)) {
      traceStep('page-plan-veto',el,field,{reason:decision.status==='mapped'?'field-disagreement':decision.status});
      return;
    }
    if (!Array.isArray(values)) values = [values];
    values = values.map(v => String(v == null ? '' : v).trim()).filter(Boolean);
    if (!values.length) return;
    if(field.type==='date' && el.matches?.('.ud__picker-input[placeholder="YYYY"]'))
      values=values.map(value=>/^\d{4}(?:[-年/.]\d{1,2}(?:[-月/.]\d{1,2})?)?$/.test(value)?value.slice(0,4):value);

    if (opts && opts.plan) {
      opts.plan.push({el, field, values});
      return;
    }

    if (!overwrite && controlHasValue(el)) { summary.skipped++; return; }

    let ok = false;
    let reason = 'selection-not-committed';
    try {
      if (el.tagName === 'SELECT') {
        if (el.multiple) ok = fillMultiSelect(el, field, values);
        else for (const v of values) { if (fillSelect(el, field, v)) { ok = true; break; } }
      } else if (isRadio(el)) {
        for (const v of values) { if (fillRadio(el, v, field)) { ok = true; break; } }
      } else if (isCustomRadioGroup(el)) {
        if (!(opts && opts.auto)) {
          for (const v of values) { if (await fillCustomRadio(el, v, field)) { ok = true; break; } }
        }
      } else if (isCustomSelect(el)) {
        if (!(opts && opts.auto)) {
          for (const v of values) { if (await fillCustomSelect(el, field, v)) { ok = true; break; } }
        }
      } else if (['date', 'month', 'datetime-local'].includes(inputType(el))) {
        ok = values.some(v => fillDate(el, v));
      } else if (isAutocompleteInput(el)) {
        ok = await fillAutocomplete(el, values[0], field, opts);
      } else if (el.getAttribute && el.getAttribute('contenteditable') === 'true') {
        ok = fillContentEditable(el, values[0]);
      } else {
        ok = setNativeValue(el, values[0]);
      }
      if (ok && !isRadio(el) && !isCustomSelect(el) && !isCustomRadioGroup(el)) {
        const expected = el.tagName === 'SELECT' && el.multiple
          ? Array.from(el.options).filter(opt => opt.selected).map(opt => opt.value)
          : el.tagName === 'SELECT' || ['date', 'month', 'datetime-local'].includes(inputType(el))
            ? el.value : values[0];
        if (opts?.settleNativeAfterBlur) {
          const written = auditValue(el);
          if (document.activeElement === el) el.blur();
          // Input and blur handlers share this window; the next field must not
          // start before asynchronous linkage has had the same 120 ms boundary.
          await wait(120);
          traceStep('blur-check',el,field,{sameAsWritten:written===auditValue(el)});
        }
        reason = await verifyControlWrite(el, expected, !!opts?.settleNativeAfterBlur);
        ok = !reason;
      }
    } catch (e) { ok = false; reason = 'execution-error'; }

    if (!ok && isCustomSelect(el) && choiceFailureReasons.has(el)) reason = choiceFailureReasons.get(el);
    if (!summary.diagnostics) summary.diagnostics = [];
    summary.diagnostics.push({ field: field.key || field.label, type: el.tagName === 'SELECT' && el.multiple ? 'select-multiple' : inputType(el) || el.tagName.toLowerCase(), status: ok ? 'verified' : 'failed', reason: ok ? '' : reason });

    if (ok) {
      let verified = verifiedControlsBySummary.get(summary);
      if (!verified) { verified = new WeakSet(); verifiedControlsBySummary.set(summary, verified); }
      if (!verified.has(el)) { summary.filled.push(field.label); verified.add(el); }
      filledByUs.set(el, isCustomSelect(el) || isCustomRadioGroup(el) ? values[0] : el.value);
      flash(el);
    } else {
      summary.failed.push(field.label);
    }
  }

  /* ================= 站点规则 ================= */

  function rulesForHost(siteRules) {
    const host = location.hostname;
    const out = [];
    for (const h of Object.keys(siteRules || {})) {
      if (host === h || host.endsWith('.' + h)) {
        const arr = siteRules[h];
        if (Array.isArray(arr)) {
          for (const r of arr) if (r && r.match && r.target) out.push(r);
        }
      }
    }
    return out;
  }

  /* ================= 学习记录查询 ================= */

  function lookupLearned(learned, learnedKeys, k) {
    if (!k || isGenericLabel(k)) return null;
    if (learned[k] && !isGenericLabel(learned[k].label)) return learned[k];
    if (k.length >= 4) {
      for (const lk of learnedKeys) {
        if (lk.length >= 4 && !isGenericLabel(lk) && !isGenericLabel(learned[lk] && learned[lk].label) && k.indexOf(lk) >= 0) return learned[lk];
      }
    }
    return null;
  }

  function fieldValue(profile, field) {
    const keys = [field.key].concat(field.fallbackKeys || []);
    for (const key of keys) {
      const value = String(profile[key] == null ? '' : profile[key]).trim();
      if (value) return value;
    }
    return '';
  }

  function recordKeyMap(group) {
    const map = {};
    for (const key of group.fieldKeys) map[normalize(key)] = key;
    for (const pair of Object.entries(group.aliases || {})) map[normalize(pair[0])] = pair[1];
    return map;
  }

  function datePartsFromRange(value) {
    return String(value || '').match(/\d{4}\s*[-年/.]\s*\d{1,2}(?:\s*[-月/.]\s*\d{1,2})?/g) || [];
  }

  function normalizeRecordObject(source, group) {
    const record = {};
    const keys = recordKeyMap(group);
    for (const pair of Object.entries(source || {})) {
      const rawKey = String(pair[0] || '').trim();
      const value = String(pair[1] == null ? '' : pair[1]).trim();
      if (!rawKey || !value) continue;
      const normalizedKey = normalize(rawKey);
      if ((normalizedKey === '时间' || normalizedKey === '起止时间' || normalizedKey === '日期') && group.timeKeys) {
        const dates = datePartsFromRange(value);
        if (dates[0]) record[group.timeKeys[0]] = dates[0];
        if (dates[1]) record[group.timeKeys[1]] = dates[1];
        continue;
      }
      const target = keys[normalizedKey];
      if (target) record[target] = value;
    }
    return record;
  }

  function parseBulkRecords(raw, group) {
    if (!raw) return [];
    let parsed = raw;
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (!text) return [];
      if (/^[\[{]/.test(text)) {
        try { parsed = JSON.parse(text); } catch (error) { parsed = null; }
      }
      if (!parsed || typeof parsed === 'string') {
        const blocks = text.split(/\n\s*\n+|\n\s*-{3,}\s*\n/).map(block => block.trim()).filter(Boolean);
        parsed = blocks.map(block => {
          const object = {};
          let lastKey = '';
          for (const line of block.split(/\r?\n/)) {
            const match = line.match(/^\s*([^:：]{1,30})\s*[:：]\s*(.*)$/);
            if (match) {
              lastKey = match[1].trim();
              object[lastKey] = match[2].trim();
            } else if (lastKey && line.trim()) {
              object[lastKey] += '\n' + line.trim();
            }
          }
          return object;
        });
      }
    }
    if (!Array.isArray(parsed)) parsed = parsed && typeof parsed === 'object' ? [parsed] : [];
    return parsed.slice(0, 20)
      .map(item => normalizeRecordObject(item, group))
      .filter(record => Object.values(record).some(value => String(value || '').trim()));
  }

  function repeatAddControl(group) {
    if(zhuanzhuanAdapter() && group.bulkKey==='educationBulk')return zhuanzhuanScope(group)?.add || null;
    if(group._root && group._add && group._root.isConnected && group._root.contains(group._add))return group._add;
    const wanted = new Set((group.addLabels || ['添加' + group.label]).map(normalize));
    const candidates = Array.from(document.querySelectorAll('[id$="_addButton"],button,[role="button"],span,div'));
    for (const node of candidates) {
      if (!isVisible(node) || !wanted.has(normalize(node.textContent))) continue;
      return node.closest('[id$="_addButton"]') || node.closest('button,[role="button"]') || node.parentElement || node;
    }
    const scope = genericRepeatScope(group);
    return scope && scope.add;
  }

  function genericRepeatScope(group, all = false) {
    // Bind generic Add buttons to their own heading; never search the whole form.
    const titles = new Set([group._scopeTitle || group.label].map(normalize));
    if(!group._scopeTitle && typeof activeFillRun!=='undefined')
      for(const section of activeFillRun?.pageSections||[])if(section.category===group.bulkKey && section.root.isConnected)titles.add(normalize(section.title));
    const aliases = {worksBulk:['作品'],awardsBulk:['获奖','竞赛获奖','其他荣誉'],researchBulk:['论文','科研成果'],educationBulk:['教育背景']};
    if(!group._scopeTitle)for (const label of aliases[group.bulkKey] || []) titles.add(normalize(label));
    const found=[];
    for (const heading of document.querySelectorAll('h2,h3,h4,legend,[role="heading"],.applyFormModuleWrapper-left')) {
      if (!isVisible(heading) || !titles.has(normalize(heading.textContent))) continue;
      let root=heading.parentElement;
      for(let depth=0;root && depth<4;depth++,root=root.parentElement){
        if(root.matches('form,body,html'))break;
        const headings=Array.from(root.querySelectorAll('h2,h3,h4,legend,[role="heading"],.applyFormModuleWrapper-left')).filter(isVisible);
        if(headings.length>1)break;
        const buttons=Array.from(root.querySelectorAll('button,[role="button"]')).filter(b=>isVisible(b)&&!b.disabled&&/^(添加|新增|增加)$/.test(normalize(b.textContent)));
        if(buttons.length===1){found.push({root,add:buttons[0],title:heading.textContent.trim()});break;}
      }
    }
    // Multiple award categories require a classification decision, not a guessed destination.
    return all?found:found.length===1?found[0]:null;
  }

  async function routeRepeatGroups(items, summary) {
    const result=[];
    for(const item of items){
      const scopes=genericRepeatScope(item.group,true);
      if(scopes.length<2){result.push(item);continue;}
      let routes=[];
      if(activeFillRun && activeFillRun.useAI){
        try {
          const response=await diagnosticAiRequest({type:'AI_ROUTE_RECORDS',payload:{
            sections:scopes.map((s,i)=>({id:String(i),title:s.title})),
            records:item.records.map((record,i)=>({id:String(i),data:record}))
          }},15000);
          checkFillRun();
          if(response && response.ok && Array.isArray(response.routes))routes=response.routes;
        }catch(error){checkFillRun();}
      }
      const buckets=scopes.map(()=>[]);
      item.records.forEach((record,index)=>{
        const matches=routes.filter(r=>String(r.recordId)===String(index));
        const route=matches.length===1?matches[0]:null;
        const destination=route && scopes.findIndex((s,i)=>String(i)===String(route.sectionId));
        if(route && Number.isFinite(route.confidence) && route.confidence>=0.9 && destination>=0 && scopes[destination].root.isConnected){
          if(typeof traceStep==='function')traceStep('ai-route-accepted',null,null,{step:index,count:destination,score:Math.round(route.confidence*100)});
          buckets[destination].push(record);
        }else{
          if(typeof traceStep==='function')traceStep('ai-route-rejected',null,null,{step:index,reason:!activeFillRun?.useAI?'ai-disabled':matches.length>1?'duplicate-route':!route?'no-route':'invalid-route'});
          (summary.diagnostics ||= []).push({field:item.group.bulkKey,status:'failed',reason:'repeat-category-unresolved',record:index+1});
          summary.failed.push(item.group.label+'第'+(index+1)+'条（类别未确定）');
        }
      });
      buckets.forEach((records,index)=>{
        if(records.length)result.push({records,group:{...item.group,_scopeTitle:scopes[index].title,_root:scopes[index].root,_add:scopes[index].add}});
      });
    }
    return result;
  }

  function repeatSectionRoot(group) {
    if(zhuanzhuanAdapter() && group.bulkKey==='educationBulk')return zhuanzhuanScope(group)?.root || null;
    if(group._root && group._root.isConnected)return group._root;
    const add = repeatAddControl(group);
    if (!add) return null;
    const generic=genericRepeatScope(group);
    if(generic && generic.add===add)return generic.root;
    const id = String(add.id || '');
    if (/_addButton$/.test(id)) {
      let root = document.getElementById(id.replace(/_addButton$/, ''));
      // Some sites attach the section ID to its heading, not the form wrapper.
      while (root && !root.contains(add)) root = root.parentElement;
      if (root && root !== document.body && root !== document.documentElement && root.querySelectorAll('[id$="_addButton"]').length === 1) return root;
    }
    const marker = add.closest('[id*="Applicant"],[id*="Recruitment"],section,fieldset');
    return marker || add.parentElement || null;
  }

  function repeatMatchingControls(group, field, controls, texts) {
    const root = repeatSectionRoot(group);
    if (!root) return [];
    // The verified section boundary provides scope even if site-generated IDs vary.
    const scopedField = Object.assign({}, field, {scope:null});
    const aliases={educationSchool:/^学校$/,educationMajor:/^专业$/,educationRank:/^成绩排名$/,internshipCompany:/^公司$/,internshipRole:/^职位名称$/,internshipContent:/^职责描述$|^描述$/,projectDescription:/^描述$/,projectRole:/^项目角色$/,languageType:/^语言$/,languageProficiency:/^精通程度$/,researchName:/^论文标题$|^论文名称$|^标题$/,awardName:/^名称$|^奖项$|^竞赛名称$|^荣誉名称$/,awardLevel:/^竞赛获奖等级$/,awardDate:/^竞赛获奖时间$/,awardDescription:/^描述$/,workDescription:/^描述$/};
    if(aliases[field.key])scopedField.patterns=[aliases[field.key],...field.patterns];
    const source = controls || collectControls(true);
    const textMap = texts || new Map(source.map(el => [el, getTextCandidates(el)]));
    return source
      .filter(el => root.contains(el) && matchScore(scopedField, textMap.get(el) || getTextCandidates(el), el) >= STRICT_MATCH_SCORE)
      .sort((a, b) => a === b ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  function repeatPrimaryField(group) {
    const primary=FIELDS.find(item=>item.key===group.primaryKey);
    // Some work sections have links and attachments, but no name input.
    // Use the observed link only as the row anchor; never write a name into it.
    if(group.bulkKey==='worksBulk' && primary && !repeatMatchingControls(group,primary).length){
      const link=FIELDS.find(item=>item.key==='workUrl');
      if(link && repeatMatchingControls(group,link).length)return link;
    }
    return primary;
  }

  function repeatControlCount(group) {
    const field = group.bulkKey==='worksBulk' ? repeatPrimaryField(group) : FIELDS.find(item=>item.key===group.primaryKey);
    if (!field) return 0;
    return repeatMatchingControls(group, field).length;
  }

  async function waitForRepeatCount(group, minimum, timeoutMs) {
    const until = Date.now() + (timeoutMs || 1200);
    let count = repeatControlCount(group);
    while (count < minimum && Date.now() < until) {
      await wait(80);
      count = repeatControlCount(group);
    }
    return count;
  }

  function zhuanzhuanAdapter(){
    const adapter=globalThis.QIUZHAO_ZHUANZHUAN;
    return adapter?.matches(location)?adapter:null;
  }

  function zhuanzhuanScope(group){
    const scopes=zhuanzhuanAdapter()?.scopes(document,group.label,isVisible)||[];
    return scopes.length===1?scopes[0]:null;
  }

  function zhuanzhuanBindings(group,records,controls,texts){
    const adapter=zhuanzhuanAdapter();
    if(!adapter || group.bulkKey!=='educationBulk')return null;
    controls=controls||collectControls(true);
    const keys=['educationSchool','educationMajor','educationStartDate'];
    const fields=keys.map(key=>FIELDS.find(field=>field.key===key));
    const primaries=repeatMatchingControls(group,fields[0],controls,texts);
    const rows=repeatRowRoots(repeatSectionRoot(group),primaries);
    const values=rows.map(row=>({
      empty:!!row&&!controls.some(el=>row.contains(el)&&controlHasValue(el)),
      values:Object.fromEntries(fields.map(field=>{
        const targets=repeatMatchingControls(group,field,controls,texts).filter(el=>row?.contains(el));
        return [field.key,targets.length===1&&!isCustomSelect(targets[0])?String(targets[0].value||''):''];
      }))
    }));
    return {rows,bindings:adapter.bind(records,values,keys)};
  }

  async function ensureRepeatedRows(group, wantedCount, records) {
    const binding=records&&zhuanzhuanBindings(group,records);
    if(binding)wantedCount=binding.rows.length+binding.bindings.filter(item=>item.reason==='new-record-required').length;
    const capped = Math.min(Math.max(wantedCount, binding?0:1), 20);
    const before = repeatControlCount(group);
    const section = repeatSectionRoot(group);
    const decision=activeFillRun?.pageSectionDecisions?.find(item=>item.root===section);
    if(decision && (decision.status!=='classified' || decision.category!==group.bulkKey))
      return {label:group.label,requested:capped,before,after:before,added:0,reason:'section-needs-review'};
    if(!section)return {label:group.label,requested:capped,before,after:before,added:0,reason:'repeat-section-unobserved'};
    if (!before && section.querySelector('input,textarea,select,[contenteditable="true"]')) {
      return {label:group.label,requested:capped,before,after:before,added:0,reason:'record-container-unresolved'};
    }
    let count = before;
    let stalled = 0;
    for (let guard = 0; guard < 24 && count < capped; guard++) {
      const previous = count;
      const add = repeatAddControl(group);
      if (!add) break;
      count = repeatControlCount(group);
      if (count >= capped) break;
      await dismissVisibleChoiceLayers();
      checkFillRun();
      traceStep('record-add-start',null,null,{count:previous,reason:group.bulkKey});
      if (!safeCustomClick(add)) break;
      const next = await waitForRepeatCount(group, previous + 1, 1400);
      traceStep('record-add-result',null,null,{count:next,ok:next>previous,reason:next>previous?'record-discovered':'no-progress'});
      if (next <= previous) stalled++;
      else stalled = 0;
      count = next;
      // A delayed add must not receive a second click, which could create duplicates.
      if (stalled >= (binding?1:2)) break;
    }
    const after = repeatControlCount(group);
    return { label: group.label, requested: capped, before, after, added: Math.max(0, after - before),reason:after>=capped?'records-ready':'record-add-incomplete' };
  }

  function repeatRowRoots(section, primaries) {
    if (!section) return primaries.map(() => null);
    return primaries.map(primary => {
      let row = primary;
      while (row.parentElement && row.parentElement !== section && section.contains(row.parentElement)) {
        const parent = row.parentElement;
        if (primaries.filter(el => parent.contains(el)).length !== 1) break;
        row = parent;
      }
      return row;
    });
  }

  async function fillRepeatedGroup(group, records, controls, texts, used, fieldByKey, overwrite, summary, opts) {
    if(!repeatSectionRoot(group)){
      (summary.diagnostics ||= []).push({field:group.bulkKey,type:'repeat-section',status:'manual',reason:'repeat-section-unobserved'});
      return;
    }
    const sectionDecision=activeFillRun?.pageSectionDecisions?.find(item=>item.root===repeatSectionRoot(group));
    if(sectionDecision && (sectionDecision.status!=='classified' || sectionDecision.category!==group.bulkKey)) {
      const root=repeatSectionRoot(group);controls.filter(el=>root?.contains(el)).forEach(el=>used.add(el));
      summary.failed.push(group.label+'（区块需核对）');return;
    }
    const primaryField = group.bulkKey==='worksBulk' ? repeatPrimaryField(group) : fieldByKey[group.primaryKey];
    const primaries = primaryField ? repeatMatchingControls(group, primaryField, controls, texts) : [];
    if(!primaries.length){
      const root=repeatSectionRoot(group);
      for(const el of controls)if(root.contains(el)){
        used.add(el);if(activeFillRun)(activeFillRun.repeatControls ||= new Set()).add(el);
      }
      (summary.diagnostics ||= []).push({field:group.bulkKey,type:'repeat-section',status:'manual',reason:'record-container-unresolved'});
      return;
    }
    const binding=zhuanzhuanBindings(group,records,controls,texts);
    const allRows=repeatRowRoots(repeatSectionRoot(group), primaries);
    const rows=binding?binding.bindings.map(item=>Number.isInteger(item.row)?binding.rows[item.row]:null):allRows;
    if(binding)binding.bindings.forEach((item,index)=>{
      if(Number.isInteger(item.row))return;
      (summary.diagnostics ||= []).push({field:group.primaryKey,record:index+1,type:'repeat',status:'failed',reason:item.reason});
      summary.failed.push(group.label+'第'+(index+1)+'条（记录未匹配）');
    });
    const aiMatches=new Map();
    // Unknown labels must be mapped against this record, never the first scalar résumé entry.
    if(activeFillRun && activeFillRun.useAI){
      const descriptors=[],fields=[],targets=new Map(),sources=new Map();
      rows.slice(0,records.length).forEach((row,index)=>{
        if(!row)return;
        const rowControls=controls.filter(el=>row.contains(el));
        const known=new Set();
        for(const key of group.fieldKeys){
          const field=fieldByKey[key];if(!field)continue;
          const matches=repeatMatchingControls(group,field,controls,texts).filter(el=>row.contains(el));
          matches.forEach(el=>known.add(el));
          if(matches.length || !records[index][key])continue;
          const id=index+':'+key;
          fields.push({key:id,label:'第'+(index+1)+'条 '+field.label,value:String(records[index][key])});sources.set(id,{index,key});
        }
        for(const el of rowControls.filter(el=>!known.has(el) && !used.has(el))){
          const id=String(targets.size);targets.set(id,{el,index});
          descriptors.push({id,label:'第'+(index+1)+'条 '+(bestLabelTextFrom(texts.get(el)||[])||''),kind:aiControlKind(el),options:aiOptionTexts(el)});
        }
      });
      if(descriptors.length && fields.length){
        try{
          const response=await diagnosticAiRequest({type:'AI_MATCH_FIELDS',payload:{controls:descriptors,fields}},15000);
          checkFillRun();
          const mappings=response && response.ok && Array.isArray(response.mappings)?response.mappings:[];
          for(const mapping of mappings){
            const target=targets.get(String(mapping.controlId)),source=sources.get(String(mapping.fieldKey));
            if(!target || !source || target.index!==source.index || !Number.isFinite(mapping.confidence) || mapping.confidence<.9)continue;
            if(mappings.filter(m=>String(m.controlId)===String(mapping.controlId)).length!==1 || mappings.filter(m=>String(m.fieldKey)===String(mapping.fieldKey)).length!==1)continue;
            if(target.el.isConnected && rows[source.index].contains(target.el))aiMatches.set(source.index+':'+source.key,target.el);
          }
        }catch(error){checkFillRun();}
      }
    }
    for (const fieldKey of group.fieldKeys) {
      const field = fieldByKey[fieldKey];
      if (!field) continue;
      const matches = repeatMatchingControls(group, field, controls, texts).filter(el => !used.has(el));
      // Reserve every field of this record group, including missing source values,
      // so the scalar fallback cannot copy the first record into later rows.
      matches.forEach(el => used.add(el));
      for (let index = 0; index < records.length; index++) {
        const value = String(records[index][fieldKey] == null ? '' : records[index][fieldKey]).trim();
        if (!value) continue;
        const row = rows[index];
        if(binding && !row)continue; // Already reported once at record level.
        const targets = row ? matches.filter(el => row.contains(el)) : [];
        const adapted=aiMatches.get(index+':'+fieldKey);
        if(!targets.length && adapted && !used.has(adapted)){targets.push(adapted);used.add(adapted);}
        if (targets.length !== 1) {
          summary.failed.push(field.label);
          if (!summary.diagnostics) summary.diagnostics = [];
          summary.diagnostics.push({field: field.key, record: index + 1, type: 'repeat', status: 'failed', reason: !row ? 'record-container-unresolved' : targets.length ? 'record-field-ambiguous' : 'record-field-missing'});
          continue;
        }
        if(binding && activeFillRun)(activeFillRun.siteRecordControls ||= new Set()).add(targets[0]);
        await applyControl(targets[0], field, value, overwrite, summary, opts);
        if(adapted===targets[0] && opts?.plan?.length){const queued=opts.plan[opts.plan.length-1];if(queued.el===adapted)queued.ai=true;}
      }
    }
    // Reserve unknown row controls too; global AI has no record index context.
    for(const row of allRows.filter(Boolean))for(const el of controls)if(row.contains(el)){
      used.add(el);if(activeFillRun)(activeFillRun.repeatControls ||= new Set()).add(el);
    }
  }

  function aiControlKind(el) {
    if (isCustomRadioGroup(el) || isRadio(el)) return 'radio';
    if (isCustomSelect(el) || el.tagName === 'SELECT') return 'select';
    if (el.getAttribute && el.getAttribute('contenteditable') === 'true') return 'richtext';
    if (el.tagName === 'TEXTAREA') return 'textarea';
    if (isAutocompleteInput(el)) return 'autocomplete';
    if (inputType(el) === 'date') return 'date';
    return 'text';
  }

  function aiOptionTexts(el) {
    if (el.tagName !== 'SELECT') return [];
    return Array.from(el.options)
      .filter(option => !option.disabled)
      .map(option => String(option.textContent || option.value || '').trim())
      .filter(Boolean)
      .slice(0, 30);
  }

  async function aiControlOptionTexts(el) {
    if (el.tagName === 'SELECT') return aiOptionTexts(el);
    if (isCustomRadioGroup(el)) {
      return Array.from(el.querySelectorAll('.phoenix-radio-group__radioItem,[role="radio"],label'))
        .filter(isVisible).map(item => String(item.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean).slice(0, 40);
    }
    if (!isCustomSelect(el)) return [];
    // Analysis is read-only: opening every dropdown looks like failed filling
    // and can trigger remote requests, validation and dependent-field resets.
    const layers = visibleChoiceLayers();
    const layer = ownedChoiceLayer(el, layers);
    const options = layer ? Array.from(layer.querySelectorAll(OPTION_SELECTOR))
      .filter(isVisible).map(item => String(item.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean).slice(0, 60) : [];
    return Array.from(new Set(options));
  }

  async function buildAiRequest(profile, customs, sourceMaterial, plannedControls = new Set()) {
    // Scalar decisions are authoritative; newly revealed scalar fields await another scan.
    const controls = collectControls(true).filter(el => !activeFillRun?.pageDecisions && !plannedControls.has(el) && !(activeFillRun && activeFillRun.repeatControls?.has(el)) && !controlHasValue(el)).slice(0, 80);
    const controlMap = new Map();
    const descriptors = [];
    for (let index = 0; index < controls.length; index++) {
      const el = controls[index];
      const id = String(index);
      const candidates = getTextCandidates(el);
      const label = bestLabelTextFrom(candidates) || '';
      const kind = aiControlKind(el);
      const inspectOptions = kind === 'radio' || (kind === 'select' && !/日期|时间|年月/.test(label));
      controlMap.set(id, el);
      descriptors.push({
        id,
        label,
        candidates: candidates.map(item => item.text).slice(0, 6),
        kind,
        options: inspectOptions ? await aiControlOptionTexts(el) : [],
      });
    }
    const usableDescriptors = descriptors.filter(item => item.label || item.candidates.length);

    const fieldMap = new Map();
    const fields = [];
    for (const field of FIELDS) {
      if (!fieldValue(profile, field)) continue;
      fieldMap.set(field.key, field);
      fields.push({ key: field.key, label: field.label, value: fieldValue(profile, field) });
    }
    customs.forEach((custom, index) => {
      const key = 'custom:' + index;
      const field = { key, label: custom.label };
      fieldMap.set(key, field);
      fields.push({ key, label: custom.label, value: custom.value });
    });
    const source = sourceMaterial && sourceMaterial.text ? {
      name: String(sourceMaterial.name || '资料').slice(0, 200),
      type: String(sourceMaterial.type || 'text').slice(0, 30),
      text: String(sourceMaterial.text).slice(0, 60000),
    } : null;
    return { controls: usableDescriptors, controlMap, fields, fieldMap, source };
  }

  async function fillWithAi(overwrite, useAI) {
    const plan = [];
    const summary = await fillPage(overwrite, {plan, deferExecution:true});
    summary.aiFilled = [];
    try {
    if (!useAI || hasVisiblePassword()) return summary;

    const store = await chrome.storage.local.get(['profile', 'sourceMaterial']);
    const profile = store.profile || {};
    const customs = (Array.isArray(profile.customs) ? profile.customs : []).filter(isUsableCustom);
    const request = await buildAiRequest(profile, customs, store.sourceMaterial || null, new Set(plan.map(task => task.el)));
    if (!request.controls.length || !request.fields.length) {
      summary.aiNote = 'nothing-to-map';
      return summary;
    }

    try {
      if (activeFillRun) activeFillRun.phase = 'ai-mapping';
      const response = await diagnosticAiRequest({
        type: 'AI_MATCH_FIELDS',
        payload: {
          page: {
            host: location.hostname,
          },
          controls: request.controls,
          fields: request.fields,
          source: request.source,
        },
      }, 40000);
      if (!response || !response.ok) {
        summary.aiNote = response && response.error ? response.error : 'ai-unavailable';
        return summary;
      }

      const usedControls = new Set();
      for (const mapping of Array.isArray(response.mappings) ? response.mappings : []) {
        const controlId = String(mapping && mapping.controlId == null ? '' : mapping.controlId);
        const fieldKey = String(mapping && mapping.fieldKey || '');
        const confidence = Number(mapping && mapping.confidence);
        const el = request.controlMap.get(controlId);
        const field = request.fieldMap.get(fieldKey);
        if (!el || !field || !el.isConnected || usedControls.has(controlId) || plan.some(task => task.el === el)) continue;
        if (Number.isFinite(confidence) && confidence < 0.65) continue;
        if (isSensitiveControl(el) || inLoginForm(el) || controlHasValue(el)) continue;

        let value = String(mapping && mapping.value || '').trim();
        if (fieldKey.startsWith('custom:')) {
          const index = Number(fieldKey.slice(7));
          if (!value) value = customs[index] ? customs[index].value : '';
        } else if (!value) {
          value = fieldValue(profile, field);
        }
        if (!value) continue;

        usedControls.add(controlId);
        plan.push({el, field, values:[value], ai:true});
      }

      const refreshedControls = collectControls(true);
      const refreshedTexts = new Map();
      for (const control of refreshedControls) refreshedTexts.set(control, getTextCandidates(control));
      Object.assign(summary, coverageSummary(refreshedControls, refreshedTexts, profile, customs));
      summary.aiNote = 'ok';
    } catch (error) {
      summary.aiNote = 'ai-request-failed';
    }
    return summary;
    } finally {
      await executeFillPlan(plan, overwrite, summary, {});
      const latest = await chrome.storage.local.get(['profile']);
      const profile = latest.profile || {};
      const controls = collectControls(true);
      Object.assign(summary, coverageSummary(controls, new Map(controls.map(el => [el, getTextCandidates(el)])), profile, (profile.customs || []).filter(isUsableCustom)));
    }
  }

  function looksLikeApplicationForm(controls, texts, profile) {
    const routeText = normalize(location.hostname + location.pathname + document.title);
    if (/招聘|网申|简历|求职|career|recruit|campus|candidate|application|apply|jobs?/.test(routeText)) return true;

    const matched = new Set();
    for (const field of FIELDS) {
      if (!fieldValue(profile, field)) continue;
      if (controls.some(el => matchScore(field, texts.get(el), el) > 0)) matched.add(field.key);
    }
    const recruitmentSpecific = ['school', 'major', 'degree', 'graduationDate', 'gpa', 'rank', 'expectedCity', 'expectedPosition'];
    return matched.size >= 3 && recruitmentSpecific.some(key => matched.has(key));
  }

  function customMatchScore(label, candidates) {
    const wanted = normalize(label);
    if (!wanted) return 0;
    // Explicit labels take precedence over nearby text, placeholders and DOM IDs.
    // Substring matches confuse a contact name with its telephone/address fields.
    const cands = candidates || [];
    const explicit = cands.filter(c => c.w >= 8 && normalize(c.text));
    const eligible = explicit.length ? explicit : cands;
    let score = 0;
    for (const cand of eligible) {
      let text = normalize(cand.text);
      if (!explicit.length) text = text.replace(/^(请输入|请填写|请选择)/, '');
      if (text === wanted) score = Math.max(score, Number(cand.w) || 1);
    }
    return score;
  }

  function coverageSummary(controls, texts, profile, customs) {
    const missingData = [];
    const remaining = [];
    const unmatched = [];
    const seen = { missingData: new Set(), remaining: new Set(), unmatched: new Set() };
    const groups = { missingData, remaining, unmatched };
    const add = (group, value) => {
      const n = normalize(value);
      if (!n || isGenericLabel(n) || seen[group].has(n)) return;
      seen[group].add(n);
      if (groups[group].length < 12) groups[group].push(value);
    };

    for (const el of controls) {
      const cands = texts.get(el) || getTextCandidates(el);
      const label = bestLabelTextFrom(cands);
      if (!label) continue;

      let best = null;
      for (const field of FIELDS) {
        if (field.type === 'choice' && !isChoiceControl(el)) continue;
        const score = matchScore(field, cands, el);
        if (score > 0 && (!best || score > best.score)) best = { field, score };
      }
      if (best) {
        const hasValue = controlHasValue(el);
        if (!fieldValue(profile, best.field) && !hasValue) add('missingData', label);
        else if (fieldValue(profile, best.field) && !hasValue) add('remaining', label);
        continue;
      }

      const custom = customs.find(cf => customMatchScore(cf.label, cands) > 0);
      if (custom) {
        if (!controlHasValue(el)) add('remaining', label);
      } else if (!controlHasValue(el)) {
        add('unmatched', label);
      }
    }
    return { missingData, remaining, unmatched };
  }

  function buildPageOverview(profile, controls) {
    const detected = controls || collectControls(true);
    const repeatValueKeys = new Set();
    for (const group of REPEAT_GROUPS) {
      for (const record of parseBulkRecords(profile[group.bulkKey], group)) {
        for (const pair of Object.entries(record)) if (String(pair[1] || '').trim()) repeatValueKeys.add(pair[0]);
      }
    }
    const hasProfileValue = field => !!fieldValue(profile, field) || repeatValueKeys.has(field.key);
    const repeatContexts = REPEAT_GROUPS.map(group => ({
      group,
      root: repeatSectionRoot(group),
      fields: group.fieldKeys.map(key => FIELDS.find(field => field.key === key)).filter(Boolean),
    })).filter(item => item.root);
    const ruleLabels = [];
    const aiLabels = [];
    let emptyControls = 0;
    let filledControls = 0;

    for (const el of detected) {
      if (controlHasValue(el)) {
        filledControls++;
        continue;
      }
      emptyControls++;
      const candidates = getTextCandidates(el);
      const label = bestLabelTextFrom(candidates) || '未命名字段';
      const repeatContext = repeatContexts.find(item => item.root.contains(el));
      if (repeatContext) {
        const repeatMatch = repeatContext.fields
          .map(field => ({ field, score: matchScore(field, candidates, el) }))
          .sort((a, b) => b.score - a.score)[0];
        if (repeatMatch && repeatMatch.score >= STRICT_MATCH_SCORE && hasProfileValue(repeatMatch.field)) {
          ruleLabels.push(label);
          continue;
        }
      }
      const matches = [];
      for (const field of FIELDS) {
        if (field.type === 'choice' && !isChoiceControl(el)) continue;
        const score = matchScore(field, candidates, el);
        if (score > 0) matches.push({ field, score });
      }
      matches.sort((a, b) => b.score - a.score);
      const best = matches[0];
      const unique = best && (!matches[1] || best.score > matches[1].score);
      if (unique && best.score >= STRICT_MATCH_SCORE && hasProfileValue(best.field)) ruleLabels.push(label);
      else aiLabels.push(label);
    }

    const repeatSections = REPEAT_GROUPS.map(group => {
      const records = parseBulkRecords(profile[group.bulkKey], group);
      return {
        label: group.label,
        records: records.length,
        rows: repeatControlCount(group),
        addable: !!repeatAddControl(group),
      };
    }).filter(item => item.records || item.rows || item.addable);

    return {
      totalControls: detected.length,
      emptyControls,
      filledControls,
      ruleCandidates: ruleLabels.length,
      aiCandidates: aiLabels.length,
      ruleLabels: Array.from(new Set(ruleLabels)).slice(0, 20),
      aiLabels: Array.from(new Set(aiLabels)).slice(0, 20),
      repeatSections,
    };
  }

  function buildOverviewAiPayload(overview) {
    const controls = collectControls(true).slice(0, 120).map((el, index) => {
      const candidates = getTextCandidates(el);
      let options = [];
      if (el.tagName === 'SELECT') options = aiOptionTexts(el);
      else if (isCustomRadioGroup(el)) {
        options = Array.from(el.querySelectorAll('.phoenix-radio-group__radioItem,[role="radio"],label'))
          .filter(isVisible)
          .map(item => String(item.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean).slice(0, 40);
      }
      return {
        id: String(index),
        label: bestLabelTextFrom(candidates) || '',
        candidates: candidates.map(item => item.text).slice(0, 6),
        kind: aiControlKind(el),
        options,
        hasValue: controlHasValue(el),
      };
    });
    return {
      page: { host: location.hostname },
      controls,
      repeatSections: overview.repeatSections.map(item => ({ label: item.label, rows: item.rows, records: item.records, addable: item.addable })),
    };
  }

  async function persistSiteScan(overview){
    const helper=globalThis.QIUZHAO_SITE_OBSERVATIONS;
    if(!helper||!overview||!Number.isFinite(overview.totalControls))return;
    try{
      const stored=await chrome.storage.local.get('siteObservations');
      const next=helper.recordScan(stored.siteObservations||{},location.hostname,overview);
      await chrome.storage.local.set({siteObservations:next});
    }catch(error){/* local observations must never block a scan */}
  }

  async function persistSiteRun(result){
    const helper=globalThis.QIUZHAO_SITE_OBSERVATIONS,report=lastSelfCheck?.report;
    if(!helper||!result)return;
    const pending=new Set([...(result.failed||[]),...(result.missingData||[]),...(result.remaining||[]),...(result.unmatched||[])]);
    const repeats=(result.repeatSections||[]).map(item=>({group:REPEAT_GROUPS.find(group=>group.label===item.label)?.bulkKey||'',requested:item.requested,before:item.before,after:item.after,reason:item.reason}));
    try{
      const stored=await chrome.storage.local.get('siteObservations');
      const next=helper.recordRun(stored.siteObservations||{},location.hostname,{outcome:result.note||'finished',verified:report?.counts?.verified||0,pending:pending.size,pageEmpty:result.pageEmptyCount,fields:report?.items||[],repeats});
      await chrome.storage.local.set({siteObservations:next});
    }catch(error){/* local observations must never block a completed run */}
  }

  async function scanPage(useAI) {
    if (hasVisiblePassword()) return { note: 'sensitive-page' };
    const store = await chrome.storage.local.get(['profile']);
    const overview = buildPageOverview(store.profile || {});
    overview.aiUsed = false;
    if (!useAI) {await persistSiteScan(overview);return overview;}
    try {
      const response = await diagnosticAiRequest({ type: 'AI_ANALYZE_PAGE', payload: buildOverviewAiPayload(overview) },40000);
      if (response && response.ok && response.overview) {
        overview.aiUsed = true;
        overview.aiRecognized = Array.isArray(response.overview.recognizedControlIds) ? response.overview.recognizedControlIds.length : 0;
        overview.aiAmbiguous = Array.isArray(response.overview.ambiguousControlIds) ? response.overview.ambiguousControlIds.length : 0;
        overview.aiRepeatSections = Array.isArray(response.overview.repeatSections) ? response.overview.repeatSections : [];
      } else {
        overview.aiNote = response && response.error ? response.error : 'AI 页面总览暂不可用';
      }
    } catch (error) {
      overview.aiNote = 'AI 页面总览请求失败';
    }
    await persistSiteScan(overview);return overview;
  }

  /* ================= 页面级填充流程 =================
   * 优先级：站点规则 > 内置字段 > 自定义字段 > 学习记录
   */
  async function fillPage(overwrite, opts) {
    opts = Object.assign({}, opts || {});
    if (opts.auto && activeFillRun) return {filled:[], skipped:0, failed:[], note:'manual-fill-active'};
    checkFillRun();
    opts.plan = opts.plan || [];
    // 自动模式遇登录页（可见密码框）整页跳过
    if (opts.auto && hasVisiblePassword()) {
      return { filled: [], skipped: 0, failed: [], note: 'sensitive-page' };
    }

    const store = await chrome.storage.local.get(['profile', 'settings', 'siteRules', 'learned']);
    const profile = store.profile || {};
    const summary = { filled: [], skipped: 0, failed: [], repeatSections: [] };
    if (activeFillRun) activeFillRun.summary = summary;
    if(activeFillRun && zhuanzhuanAdapter())activeFillRun.siteEducationRestricted=!!profile.educationBulk;

    const customs = (Array.isArray(profile.customs) ? profile.customs : []).filter(isUsableCustom);
    const learned = store.learned || {};
    const learnedKeys = Object.keys(learned).filter(key => !isGenericLabel(key));

    let repeatedGroups = REPEAT_GROUPS
      .map(group => ({ group, records: parseBulkRecords(profile[group.bulkKey], group) }))
      .filter(item => item.records.length);
    if (!opts.auto) {
      repeatedGroups = await routeRepeatGroups(repeatedGroups, summary);
      for (const item of repeatedGroups) summary.repeatSections.push(await ensureRepeatedRows(item.group, item.records.length, item.records));
    }

    const detectedControls = collectControls(true);
    const texts = new Map();
    for (const c of detectedControls) {
      texts.set(c, getTextCandidates(c));
      traceStep('control-discovered',c,null,{reason:'awaiting-mapping'});
    }
    if (opts.auto && !looksLikeApplicationForm(detectedControls, texts, profile)) {
      return { filled: [], skipped: 0, failed: [], note: 'non-application-page' };
    }
    const controls = opts.auto
      ? detectedControls.filter(el => !isCustomSelect(el) && !isCustomRadioGroup(el))
      : detectedControls;
    const used = new Set();
    // This profile schema has internships, not employment. Do not let global AI
    // or scalar fallbacks silently turn an internship into a work record.
    const siteAdapter=zhuanzhuanAdapter();
    if(siteAdapter){
      const workScopes=siteAdapter.scopes(document,'工作经历',isVisible);
      for(const el of controls)if(workScopes.some(scope=>scope.root.contains(el))){
        used.add(el);if(activeFillRun)(activeFillRun.repeatControls ||= new Set()).add(el);
      }
      if(workScopes.length){
        summary.failed.push('工作经历（需确认资料对应关系）');
        (summary.diagnostics ||= []).push({field:'internshipsBulk',status:'manual',reason:'work-profile-mapping-required'});
      }
    }
    const fieldByKey = {};
    FIELDS.forEach(f => fieldByKey[f.key] = f);
    summary.overview = buildPageOverview(profile, controls);
    if(activeFillRun?.pageDecisions) {
      summary.pagePlan=activeFillRun.pagePlanReport;
      for(const [el,decision] of activeFillRun.pageDecisions) {
        if(used.has(el) || !el.isConnected || decision.status!=='mapped' || controlHasValue(el))continue;
        const field=fieldByKey[decision.fieldKey],value=field && fieldValue(profile,field);
        if(!value) {
          (summary.diagnostics ||= []).push({field:decision.fieldKey,status:'missing',reason:'profile-value-missing'});
          used.add(el);continue;
        }
        used.add(el);await applyControl(el,field,value,overwrite,summary,opts);
      }
      for(const [el,decision] of activeFillRun.pageDecisions)if(decision.status!=='mapped')used.add(el);
    }

    // 1) 站点规则（按域名，优先级最高）
    for (const rule of rulesForHost(store.siteRules)) {
      const nMatch = normalize(rule.match);
      const field = fieldByKey[rule.target];
      if (!nMatch || !field) continue;
      const value = fieldValue(profile, field);
      if (!value) continue;
      let target = null;
      for (const el of controls) {
        if (used.has(el)) continue;
        if (normalize(el.getAttribute('name')) === nMatch || normalize(el.id) === nMatch) { target = el; break; }
      }
      if (!target) {
        for (const el of controls) {
          if (used.has(el)) continue;
          if ((texts.get(el) || []).some(c => normalize(c.text) === nMatch)) { target = el; break; }
        }
      }
      if (target) { used.add(target); await applyControl(target, field, value, overwrite, summary, opts); }
    }

    // 2) 批量经历。按页面顺序把每条记录写入对应的重复表单行。
    for (const item of repeatedGroups) {
      await fillRepeatedGroup(item.group, item.records, controls, texts, used, fieldByKey, overwrite, summary, opts);
    }
    if(siteAdapter && profile.educationBulk){
      const educationScopes=siteAdapter.scopes(document,'教育经历',isVisible);
      for(const el of controls)if(educationScopes.some(scope=>scope.root.contains(el))){
        used.add(el);if(activeFillRun)(activeFillRun.repeatControls ||= new Set()).add(el);
      }
    }

    // 3) 内置字段
    for (const field of FIELDS) {
      const value = fieldValue(profile, field);
      if (!value) continue;

      if (field.type === 'choice') {
        const matches = [];
        for (const el of controls) {
          if (used.has(el)) continue;
          if (!isChoiceControl(el)) continue;
          const s = matchScore(field, texts.get(el), el);
          if (s >= STRICT_MATCH_SCORE) matches.push({ el, s });
        }
        matches.sort((a, b) => b.s - a.s);
        if (matches.length) {
          used.add(matches[0].el);
          await applyControl(matches[0].el, field, value, overwrite, summary, opts);
        }
      } else if (field.multi) {
        const segs = value.split(/[\s,，、;；]+/).filter(Boolean);
        const matches = controls.filter(el => !used.has(el) && matchScore(field, texts.get(el), el) >= STRICT_MATCH_SCORE);
        for (let i = 0; i < matches.length; i++) {
          const el = matches[i];
          used.add(el);
          let vals;
          if (matches.length > 1) {
            vals = [segs[Math.min(i, segs.length - 1)] || value, value];
          } else {
            vals = [value].concat(segs.slice().reverse());
          }
          await applyControl(el, field, vals, overwrite, summary, opts);
        }
      } else {
        const matches = [];
        for (const el of controls) {
          if (used.has(el)) continue;
          const s = matchScore(field, texts.get(el), el);
          if (s >= STRICT_MATCH_SCORE) matches.push({ el, s });
        }
        matches.sort((a, b) => b.s - a.s);
        const best = matches[0] && (!matches[1] || matches[0].s > matches[1].s) ? matches[0] : null;
        if (best) {
          used.add(best.el);
          await applyControl(best.el, field, value, overwrite, summary, opts);
        }
      }
    }

    // 4) 自定义字段：标签精确对应，并且最高分控件必须唯一。
    for (const cf of customs) {
      const matches = controls.filter(el => !used.has(el))
        .map(el => ({el, score: customMatchScore(cf.label, texts.get(el))}))
        .filter(item => item.score > 0).sort((a, b) => b.score - a.score);
      const best = matches[0];
      if (best && (!matches[1] || best.score > matches[1].score)) {
        used.add(best.el);
        await applyControl(best.el, { key: 'custom:' + cf.label, label: cf.label }, cf.value, overwrite, summary, opts);
      }
    }

    // 5) 学习记录（key 为归一化标签，跨站点复用）
    if (learnedKeys.length) {
      for (const el of controls) {
        if (used.has(el)) continue;
        if (controlHasValue(el) && !overwrite) continue;
        let hit = null;
        for (const cand of texts.get(el) || []) {
          const entry = lookupLearned(learned, learnedKeys, normalize(cand.text));
          if (entry && (!hit || cand.w > hit.w)) hit = { w: cand.w, data: entry };
        }
        if (hit) {
          used.add(el);
          await applyControl(el, { key: 'learned', label: hit.data.label || '学习记录' }, hit.data.value, overwrite, summary, opts);
        }
      }
    }

    if (!opts.deferExecution) await executeFillPlan(opts.plan, overwrite, summary, opts);
    const finalControls = collectControls(true);
    Object.assign(summary, coverageSummary(finalControls, new Map(finalControls.map(el => [el, getTextCandidates(el)])), profile, customs));
    return summary;
  }

  /* ================= 学习式映射：被动记录用户手填 ================= */

  let learnBuffer = {};
  let learnTimer = null;

  function learnFromChange(el) {
    try {
      if (Date.now() < ignoreLearningUntil) return;
      if (el.disabled || el.readOnly) return;
      const t = inputType(el);
      if (['password', 'file', 'checkbox', 'radio', 'hidden', 'button', 'submit', 'reset', 'image'].includes(t)) return;
      // 敏感页面/登录表单一律不学
      if (hasVisiblePassword() || inLoginForm(el)) return;
      const v = (el.value || '').trim();
      if (!v || v.length > 60) return;
      const cands = getTextCandidates(el);
      if (cands.some(c => { const n = normalize(c.text); return n && SENSITIVE_TEXT.test(n); })) return;

      const label = bestLabelTextFrom(cands);
      if (!label) return;
      const n = normalize(label);
      if (!n || isGenericLabel(n) || n.length < 2 || n.length > 30) return;

      // 自己填的且值未变则不学；用户改过则学修正值
      if (filledByUs.has(el)) {
        if (v === String(filledByUs.get(el) || '').trim()) return;
      }

      learnBuffer[n] = { label: label, value: v, at: Date.now() };
      clearTimeout(learnTimer);
      learnTimer = setTimeout(persistLearned, 800);
    } catch (e) { /* 忽略 */ }
  }

  async function persistLearned() {
    const keys = Object.keys(learnBuffer);
    if (!keys.length) return;
    const buf = learnBuffer;
    learnBuffer = {};
    try {
      const store = await chrome.storage.local.get('learned');
      const learned = store.learned || {};
      for (const k of keys) {
        const prev = learned[k];
        if (prev && prev.value === buf[k].value) {
          prev.count = (prev.count || 1) + 1;
          prev.at = buf[k].at;
        } else {
          learned[k] = Object.assign({ count: 1 }, buf[k]);
        }
      }
      // 上限 120 条，超出按最后使用时间淘汰
      const entries = Object.entries(learned);
      if (entries.length > 120) {
        entries.sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
        const keep = {};
        for (const pair of entries.slice(0, 120)) keep[pair[0]] = pair[1];
        await chrome.storage.local.set({ learned: keep });
      } else {
        await chrome.storage.local.set({ learned: learned });
      }
    } catch (e) { /* 忽略 */ }
  }

  document.addEventListener('change', (e) => {
    if (programmaticFill) return;
    const el = e.target;
    if (!el || !el.tagName) return;
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') learnFromChange(el);
  }, true);

  /* ================= 未识别字段导出 ================= */

  function collectUnmatched(profile, learned) {
    const customs = (Array.isArray(profile.customs) ? profile.customs : []).filter(isUsableCustom);
    const learnedKeys = Object.keys(learned || {}).filter(key => !isGenericLabel(key));
    const seen = new Set();
    const lines = [];
    for (const el of collectControls(true)) {
      const cands = getTextCandidates(el);
      if (FIELDS.some(f => matchScore(f, cands, el) > 0)) continue;
      const best = bestLabelTextFrom(cands);
      if (!best) continue;
      const n = normalize(best);
      if (!n || isGenericLabel(n) || seen.has(n)) continue;
      // 已被自定义字段/学习记录覆盖的不再列为未识别
      if (customs.some(c => { const cl = normalize(c.label); return cl && (n.indexOf(cl) >= 0 || cl.indexOf(n) >= 0); })) continue;
      if (lookupLearned(learned, learnedKeys, n)) continue;
      seen.add(n);
      const nameAttr = el.getAttribute('name');
      const type = el.tagName === 'SELECT' ? 'select' : (inputType(el) || 'text');
      lines.push(best + (nameAttr ? '  (name=' + nameAttr + ')' : '') + '  [type=' + type + ']');
    }
    return lines;
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* 降级 */ }
    return new Promise((resolve) => {
      try {
        suppressObserver = true;
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('data-qiuzhao-toast', '1');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        setTimeout(() => { suppressObserver = false; }, 100);
        resolve(!!ok);
      } catch (e) { suppressObserver = false; resolve(false); }
    });
  }

  /* ================= 视觉反馈 ================= */

  function flash(el) {
    const target = isRadio(el) ? (commonContainer(radioGroupOf(el)) || el) : el;
    const prevShadow = target.style.boxShadow;
    const prevTransition = target.style.transition;
    target.style.transition = 'box-shadow .3s ease';
    target.style.boxShadow = '0 0 0 3px rgba(20,184,166,.55)';
    setTimeout(() => {
      target.style.boxShadow = prevShadow;
      setTimeout(() => { target.style.transition = prevTransition; }, 400);
    }, 1200);
  }

  let suppressObserver = false;

  function toast(msg, ms) {
    if (window.top !== window) return;
    try {
      suppressObserver = true;
      const t = document.createElement('div');
      t.setAttribute('data-qiuzhao-toast', '1');
      t.textContent = msg;
      Object.assign(t.style, {
        position: 'fixed', top: '16px', right: '16px', zIndex: '2147483647',
        background: 'rgba(15,23,42,.92)', color: '#fff', fontSize: '13px',
        lineHeight: '1.5', padding: '10px 14px', borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,.25)', pointerEvents: 'none',
        fontFamily: 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif'
      });
      document.documentElement.appendChild(t);
      setTimeout(() => {
        suppressObserver = true;
        t.remove();
        setTimeout(() => { suppressObserver = false; }, 100);
      }, ms || 2600);
      setTimeout(() => { suppressObserver = false; }, 150);
    } catch (e) { /* 某些页面禁止改动 DOM，忽略 */ }
  }

  /* ================= 自动填充 & 动态表单监听 ================= */

  let autoFillEnabled = false;
  let observer = null;
  let debounceTimer = null;

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((muts) => {
      if (suppressObserver) return;
      if (!muts.some(m => m.addedNodes.length || m.removedNodes.length)) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (!autoFillEnabled) return;
        const r = await runAutoFill();
        if (r.filled.length) toast('秋招助手：已自动填充 ' + r.filled.length + ' 项');
      }, 900);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    clearTimeout(debounceTimer);
  }

  /* ================= 消息入口 & 初始化 ================= */

  let pendingManualFill = null;
  let lastFillPreview = null;
  let preflightAiEvents=[];

  function previewControlState(el) {
    return {el,value:auditValue(el),labels:JSON.stringify(getTextCandidates(el).map(item=>item.text))};
  }
  async function previewForm() {
    if(activeFillRun)return {note:'fill-running'};
    if(hasVisiblePassword())return {note:'sensitive-page'};
    await ensureDefaultProfileLoaded();
    const {profile={}}=await chrome.storage.local.get('profile');
    const controls=collectControls(true),overview=buildPageOverview(profile,controls);
    lastFillPreview={token:crypto.randomUUID(),url:location.href,profile:JSON.stringify(profile),controls:controls.map(previewControlState)};
    return {...overview,previewToken:lastFillPreview.token};
  }
  async function validFillPreview(token) {
    const preview=lastFillPreview;
    if(!preview||preview.token!==token||preview.url!==location.href)return false;
    const {profile={}}=await chrome.storage.local.get('profile');
    const controls=collectControls(true);
    if(hasVisiblePassword() || JSON.stringify(profile)!==preview.profile || controls.length!==preview.controls.length)return false;
    return controls.every((el,i)=>{
      const current=previewControlState(el),before=preview.controls[i];
      return el===before.el && current.value===before.value && current.labels===before.labels;
    });
  }

  function traceStep(stage,el,field,detail={}){
    const run=activeFillRun;if(!run){if(stage.startsWith('ai-'))preflightAiEvents.push({at:Date.now(),stage,detail});preflightAiEvents=preflightAiEvents.slice(-20);return;}
    run.events ||= [];run.traceIds ||= new WeakMap();
    let control=0;
    if(el){if(!run.traceIds.has(el)){run.traceControlCount=(run.traceControlCount||0)+1;run.traceIds.set(el,run.traceControlCount);}control=run.traceIds.get(el);}
    const key=FIELDS.some(f=>f.key===field?.key)?field.key:'unmapped';
    const event={seq:(run.traceSequence=(run.traceSequence||0)+1),ms:Date.now()-run.startedAt,stage,control,fieldKey:key,...detail};
    if(el){
      event.connected=el.isConnected;
      // Trace collection must not repeat expensive layout/visibility validation at every step.
      event.hasValue=['INPUT','TEXTAREA','SELECT'].includes(el.tagName)?!!el.value:
        Array.from(el.querySelectorAll('input[readonly],.ant-picker input,.ant-select-selection-item,[aria-selected="true"],[aria-checked="true"],input:checked'))
          .some(node=>!!(node.value||node.textContent||node.checked));
      event.invalid=el.getAttribute('aria-invalid')==='true'||!!el.querySelector('[aria-invalid="true"]');
      event.tag=el.tagName.toLowerCase();event.widget=el.closest('.ant-select,.ant-picker')?'ant':el.closest('[class*="phoenix-"]')?'phoenix':'other';
    }
    run.events.push(event);
    if(run.events.length>600){run.events.splice(180,1);run.droppedEvents=(run.droppedEvents||0)+1;}
  }

  async function diagnosticAiRequest(message,timeout){
    traceStep('ai-request',null,null,{operation:message.type});
    if(activeFillRun)await persistRunCheckpoint(activeFillRun,activeFillRun.summary||{});
    try{
      const response=await boundedRequest(chrome.runtime.sendMessage(message),timeout);
      traceStep('ai-response',null,null,{operation:message.type,ok:response?.ok===true,
        reason:response?.ok?'response-received':response?.errorCode||'service-rejected',
        count:response?.mappings?.length||response?.routes?.length||0,action:response?.action?.type||'none'});
      return response;
    }catch(error){
      traceStep('ai-response',null,null,{operation:message.type,ok:false,reason:/timeout/i.test(String(error))?'timeout':/cancel/i.test(String(error))?'cancelled':'transport-error'});
      throw error;
    }
  }

  async function persistRunCheckpoint(run,result){
    try{
      const saved=await boundedRequest(chrome.runtime.sendMessage({type:'SAVE_RUN_LOG',log:makeRunLog(result,run)}),3000);
      run.lastCheckpoint=Date.now();return !!saved?.ok;
    }catch(error){return false;}
  }

  function requiresLongSettlement(record){
    const el=record?.el;
    if(!el || !record.verified || record.skipped)return false;
    if(isCustomSelect(el)||isCustomRadioGroup(el)||isAutocompleteInput(el)||el.getAttribute('contenteditable')==='true')return true;
    if(el.closest?.('.ant-picker,.el-date-editor,.arco-picker,.phoenix-datepicker,.ant-select,.el-select,.arco-select'))return true;
    if(el.tagName==='TEXTAREA')return false;
    if(el.tagName!=='INPUT')return true;
    return !['','text','email','tel','number','url','search'].includes(inputType(el));
  }

  async function observeRunSettlement(run){
    const records=(run.auditRecords||[]).filter(record=>record.verified&&!record.skipped);
    // Native text writes are read back immediately and need only one quiet-window sample.
    // Stateful widgets keep the three delayed checks because their visual value can lag commit.
    const longObservation=records.some(requiresLongSettlement);
    const delays=longObservation?[500,1500,3000]:[450];
    // Only in-memory evidence; never serialize these values into run logs.
    // Include skipped/failed records too: final verification examines all of them.
    const stable=new Map((run.auditRecords||[]).map(r=>[r.el,auditValue(r.el)]));
    run.settledControls=null;
    for(const delay of delays){
      await wait(delay);
      for(const [el,value] of stable){
        if(!el.isConnected || auditValue(el)!==value)stable.delete(el);
      }
      for(const r of records){
        traceStep('settlement-check',r.el,r.field,{sameAsWritten:r.after===auditValue(r.el),previousVerified:r.verified});
      }
    }
    if(longObservation)run.settledControls=stable;
  }

  async function runAutoFill(){
    if(activeFillRun)return {filled:[],failed:[],note:'manual-run-active'};
    try{await ensureDefaultProfileLoaded();}catch{return {filled:[],failed:[],note:'default-profile-unavailable'};}
    if(activeFillRun)return {filled:[],failed:[],note:'manual-run-active'};
    const run={startedAt:Date.now(),automatic:true,useAI:false,overwrite:false};
    const result=await fillPage(false,{auto:true});
    if(result.filled?.length || result.failed?.length){
      try{await chrome.runtime.sendMessage({type:'SAVE_RUN_LOG',log:makeRunLog(result,run)});}catch(error){/* fill result remains available */}
    }
    return result;
  }

  function makeRunLog(result,run) {
    const known=new Map(FIELDS.flatMap(f=>[[f.key,f.key],[f.label,f.key]]));
    const records=run.auditRecords||[];
    const report=!run.automatic && lastSelfCheck && lastSelfCheck.report;
    return {
      startedAt:run.startedAt,durationMs:Date.now()-run.startedAt,host:location.hostname,
      contentBuild:'1.16.10-dev',useAI:run.useAI,overwrite:run.overwrite,runId:run.runId,
      events:run.events||[],droppedEvents:run.droppedEvents||0,
      trigger:run.automatic?'automatic':'manual',verification:run.automatic?'immediate':report?'final':'incomplete',
      outcome:['fill-cancelled','fill-timeout','fill-error','sensitive-page'].includes(result.note)?result.note:run.finished||run.automatic?'finished':'running',
      counts:{verified:result.filled?.length||0,nonempty:result.pageFilledCount||0,empty:result.pageEmptyCount||0},
      aiRequests:run.adaptationCalls||0,
      items:(report?.items||records.map((r,i)=>({id:'field-'+(i+1),label:r.field.label,status:'manual',reason:'run-interrupted'}))).map(item=>({
        ordinal:Number(item.id.replace('field-','')),control:report?run.traceIds?.get(lastSelfCheck.targets.get(item.id))||0:0,fieldKey:known.get(item.label)||'unmapped',status:item.status,reason:item.reason
      })),
      diagnostics:(result.diagnostics||[]).map(d=>({fieldKey:known.get(d.field)||REPEAT_GROUPS.find(g=>g.bulkKey===d.field)?.bulkKey||'unmapped',record:d.record,status:d.status,reason:d.reason})),
      repeats:(result.repeatSections||[]).map(s=>({group:REPEAT_GROUPS.find(g=>g.label===s.label)?.bulkKey||'unmapped',requested:s.requested,before:s.before,after:s.after,reason:s.reason})),
      persistence:'not-tested'
    };
  }

  function observePlanSections() {
    const sections=[];
    for(const heading of document.querySelectorAll('h2,h3,h4,legend,[role="heading"],.applyFormModuleWrapper-left')) {
      if(!isVisible(heading))continue;
      let root=heading.parentElement;
      for(let depth=0;root && depth<4;depth++,root=root.parentElement) {
        if(root.matches('form,body,html'))break;
        if(Array.from(root.querySelectorAll('h2,h3,h4,legend,[role="heading"],.applyFormModuleWrapper-left')).filter(isVisible).length>1)break;
        const adds=Array.from(root.querySelectorAll('button,[role="button"]')).filter(el=>isVisible(el)&&!el.disabled&&/^(添加|新增|增加)$/.test(normalize(el.textContent)));
        if(adds.length===1) {sections.push({id:String(sections.length),title:heading.textContent.trim(),root,add:adds[0]});break;}
      }
    }
    return sections;
  }

  async function prepareExecutablePagePlan() {
    const sections=observePlanSections();
    const repeatRoots=REPEAT_GROUPS.map(group=>repeatSectionRoot(group)).filter(Boolean);
    const controls=collectControls(true).filter(el=>!sections.some(s=>s.root.contains(el)) && !repeatRoots.some(root=>root.contains(el)));
    if(controls.length>120 || sections.length>30)throw Error('page-plan-capacity-exceeded');
    // Reuse only a previously verified mapping for the exact local control identity.
    // The cache contains labels/names and field keys, never profile values or page content.
    const cacheKey=el=>{
      const identity=String(el.getAttribute('name')||el.id||'').trim().toLowerCase();
      const label=String(bestLabelTextFrom(getTextCandidates(el))||'').trim().toLowerCase();
      return identity&&label?aiControlKind(el)+'|'+identity+'|'+label:'';
    };
    try{
      const stored=await chrome.storage.local.get('pagePlanCache');
      const entries=stored.pagePlanCache?.[location.hostname]?.entries;
      const keyed=controls.map(el=>({el,key:cacheKey(el)}));
      const byKey=new Map(Array.isArray(entries)?entries.map(entry=>[entry.key,entry]):[]);
      const known=new Set(FIELDS.map(field=>field.key));
      const cached=keyed.map(item=>({el:item.el,entry:byKey.get(item.key)}));
      const fieldKeys=cached.map(item=>item.entry?.fieldKey);
      if(keyed.length && keyed.every(item=>item.key) && new Set(keyed.map(item=>item.key)).size===keyed.length &&
        cached.every(item=>item.entry && known.has(item.entry.fieldKey)) && new Set(fieldKeys).size===fieldKeys.length){
        activeFillRun.pageDecisions=new Map(cached.map(item=>[item.el,{status:'mapped',fieldKey:item.entry.fieldKey}]));
        activeFillRun.pageSectionDecisions=[];
        activeFillRun.pagePlanReport={controls:cached.map((item,index)=>({id:String(index),status:'mapped',fieldKey:item.entry.fieldKey,source:'verified-local-cache'})),sections:[],coverage:'verified-local-cache'};
        traceStep('page-plan-cache-hit',null,null,{count:cached.length});
        return;
      }
    }catch(error){/* cache is optional; model planning remains the safe fallback */}
    const repeatKeys=new Set(REPEAT_GROUPS.flatMap(group=>group.fieldKeys));
    const payload={
      controls:controls.map((el,index)=>({id:String(index),label:bestLabelTextFrom(getTextCandidates(el))||'',kind:aiControlKind(el),required:el.required===true||el.getAttribute('aria-required')==='true',hasValue:controlHasValue(el)})),
      sections:sections.map(s=>({id:s.id,title:s.title})),
      fields:FIELDS.filter(f=>!repeatKeys.has(f.key)).map(f=>({key:f.key,label:f.label}))
    };
    const response=await diagnosticAiRequest({type:'AI_PLAN_PAGE',payload},12000);
    checkFillRun();
    if(!response?.ok || !Array.isArray(response.plan?.controls) || !Array.isArray(response.plan?.sections))throw Error('page-plan-unavailable');
    const decisions=new Map();
    controls.forEach((el,index)=>{
      const matches=response.plan.controls.filter(d=>d.id===String(index));
      decisions.set(el,matches.length===1?matches[0]:{status:'review'});
    });
    activeFillRun.pageDecisions=decisions;
    activeFillRun.pageSectionDecisions=sections.map(s=>({...s,...(response.plan.sections.find(d=>d.id===s.id)||{status:'review'})}));
    activeFillRun.pageSections=activeFillRun.pageSectionDecisions.filter(s=>s.status==='classified');
    activeFillRun.pagePlanReport={controls:response.plan.controls,sections:response.plan.sections,coverage:'visible-scalar-controls-and-heading-add-sections'};
    activeFillRun.pagePlanCacheCandidates=controls.map(el=>({el,key:cacheKey(el),fieldKey:decisions.get(el)?.fieldKey})).filter(item=>item.key&&item.fieldKey);
    traceStep('page-plan-ready',null,null,{count:controls.length,reason:'bounded-plan'});
  }

  async function persistVerifiedPagePlan(run,report){
    const candidates=run?.pagePlanCacheCandidates;
    if(!Array.isArray(candidates)||!candidates.length||!lastSelfCheck?.targets)return;
    const statusByControl=new Map(report.items.map(item=>[lastSelfCheck.targets.get(item.id),item.status]));
    const verified=candidates.filter(item=>statusByControl.get(item.el)==='verified');
    if(!verified.length)return;
    try{
      const stored=await chrome.storage.local.get('pagePlanCache');
      const cache=stored.pagePlanCache&&typeof stored.pagePlanCache==='object'?stored.pagePlanCache:{};
      const prior=Array.isArray(cache[location.hostname]?.entries)?cache[location.hostname].entries:[];
      const entries=new Map(prior.map(item=>[item.key,item]));
      for(const item of verified)entries.set(item.key,{key:item.key,fieldKey:item.fieldKey});
      cache[location.hostname]={entries:Array.from(entries.values()).slice(-120),updatedAt:Date.now()};
      const hosts=Object.entries(cache).sort((a,b)=>(b[1]?.updatedAt||0)-(a[1]?.updatedAt||0)).slice(0,12);
      await chrome.storage.local.set({pagePlanCache:Object.fromEntries(hosts)});
      traceStep('page-plan-cache-save',null,null,{count:verified.length});
    }catch(error){/* filling result must not depend on this local acceleration cache */}
  }

  async function runManualFill(overwrite, useAI, selfCheck) {
    activeDatePopup=null;
    lastSelfCheck = null;
    activeFillRun = {runId:crypto.randomUUID(),startedAt:Date.now(),overwrite:!!overwrite,phase:'planning', field:'', total:0, completed:0, deadline:Date.now()+180000, cancelled:false,selfCheck:!!selfCheck,useAI:!!useAI,adaptationCalls:0,followPausedUntil:0};
    lastManualStatus=null;
    activeFillRun.clock=globalThis.QIUZHAO_RUN_TIMING?.attach(activeFillRun);
    let finalResult;
    try {
      await ensureDefaultProfileLoaded();
      traceStep('run-start',null,null,{reason:useAI?'ai-enabled':'ai-disabled'});
      for(const event of preflightAiEvents.filter(e=>Date.now()-e.at<120000))traceStep('preflight-'+event.stage,null,null,event.detail);
      preflightAiEvents=[];
      await persistRunCheckpoint(activeFillRun,{});
      let runUseAI=useAI;
      if(runUseAI && !hasVisiblePassword()){
        try{await prepareExecutablePagePlan();}
        catch(error){
          runUseAI=false;
          activeFillRun.aiPlanNote='page-plan-unavailable-local-fallback';
          traceStep('page-plan-fallback',null,null,{reason:/timeout/i.test(String(error))?'timeout':'unavailable'});
        }
      }
      const result = await fillWithAi(overwrite, runUseAI);
      if(activeFillRun.aiPlanNote)result.aiNote=activeFillRun.aiPlanNote;
      result.aiAdaptationRequests = activeFillRun.adaptationCalls;
      if (result.note !== 'sensitive-page') {
        activeFillRun.phase='self-check';
        await observeRunSettlement(activeFillRun);
        // Every manual run audits final values, not only the optional detailed-report mode.
        const report=await runSelfCheck(result);
        await persistVerifiedPagePlan(activeFillRun,report);
        result.filled=report.items.filter(item=>item.status==='verified').map(item=>item.label);
        for(const item of report.items.filter(item=>item.status==='failed')){
          if(!result.failed.includes(item.label))result.failed.push(item.label);
          (result.diagnostics ||= []).push({field:item.label,status:'failed',reason:item.reason});
        }
        result.aiFilled=(result.aiFilled||[]).filter(label=>result.filled.includes(label));
        const stored=await chrome.storage.local.get('profile'),profile=stored.profile||{};
        const controls=collectControls(true);
        Object.assign(result,coverageSummary(controls,new Map(controls.map(el=>[el,getTextCandidates(el)])),profile,(profile.customs||[]).filter(isUsableCustom)));
        if(selfCheck)result.selfCheck=report;
      }
      finalResult=result;return result;
    } catch (error) {
      const summary = activeFillRun.summary || {filled:[],failed:[],skipped:0};
      summary.note = /fill-cancelled|fill-timeout/.test(String(error.message)) ? error.message : 'fill-error';
      finalResult=summary;return summary;
    } finally {
      activeFillRun.cleaning = true;
      try { await dismissVisibleChoiceLayers(); } catch (error) { /* bounded cleanup */ }
      if(finalResult){
        // Capture after popup cleanup and before persistence, not only in the reply handler.
        if(finalResult.note !== 'sensitive-page'){
          const controls=collectControls(true);
          finalResult.pageFilledCount=controls.filter(controlHasValue).length;
          finalResult.pageEmptyCount=controls.length-finalResult.pageFilledCount;
        }
        activeFillRun.finished=true;
        traceStep('run-end',null,null,{reason:finalResult.note||'finished'});
        const pending=new Set([...(finalResult.failed||[]),...(finalResult.missingData||[]),...(finalResult.remaining||[]),...(finalResult.unmatched||[])]);
        const pendingItems=(lastSelfCheck?.report?.items||[]).filter(item=>item.status!=='verified').map(item=>({id:item.id,label:item.label,reason:item.reason}));
        const structural=new Set();
        for(const item of finalResult.diagnostics||[]){
          if(!/^(record-|repeat-section-|source-record-|existing-record-|partial-record-|work-profile-)/.test(item.reason||''))continue;
          const key=[item.field,item.record,item.reason].join(':');if(structural.has(key))continue;structural.add(key);
          const label=item.reason==='work-profile-mapping-required'?'工作经历':FIELDS.find(field=>field.key===item.field)?.label || REPEAT_GROUPS.find(group=>group.bulkKey===item.field)?.label || '经历';
          pendingItems.push({id:null,label:label+(item.record?' 第'+item.record+'条':''),reason:item.reason});
        }
        lastManualStatus={running:false,runId:activeFillRun.runId,outcome:finalResult.note||'finished',timing:activeFillRun.clock?.finish(),summary:{verified:(finalResult.filled||[]).length,pending:lastSelfCheck?pendingItems.length:pending.size},pendingItems:pendingItems.slice(0,50)};
        await persistSiteRun(finalResult);
        finalResult.logSaved=await persistRunCheckpoint(activeFillRun,finalResult);
      }
      activeFillRun = null;
      activeDatePopup=null;
    }
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object') return;
    if(msg.type==='SHOW_AUTOFILL_NOTICE'){
      toast('请打开秋招助手侧栏，识别并选择本次要填写的表单区域。',5000);sendResponse({ok:true});return;
    }
    if (msg.type === 'PROBE_FORM_FRAMES') {
      const sensitive=hasVisiblePassword();
      chrome.runtime.sendMessage({type:'REPORT_FORM_FRAME',requestId:msg.requestId,
        frame:{contentBuild:'1.16.10-dev',totalControls:sensitive?0:collectControls(true).length,sensitive}})
        .then(()=>sendResponse({ok:true}),()=>sendResponse({ok:false}));
      return true;
    }
    if (msg.type === 'GET_SELF_CHECK') {sendResponse(lastSelfCheck ? {report:lastSelfCheck.report} : {error:'no-report'});return;}
    if (msg.type === 'LOCATE_SELF_CHECK') {
      const el = lastSelfCheck && lastSelfCheck.targets.get(msg.id);
      if (!el || !el.isConnected || !isVisible(el)) {sendResponse({ok:false});return;}
      el.scrollIntoView({block:'center',behavior:'smooth'});flash(el);sendResponse({ok:true});return;
    }
    if (msg.type === 'PING') {
      sendResponse({ ok: true, host: location.hostname, contentBuild:'1.16.10-dev' });
      return;
    }
    if (msg.type === 'SCAN_FORM') {
      scanPage(!!msg.useAI)
        .then(r => sendResponse(r))
        .catch(e => sendResponse({ error: String(e), totalControls: 0, emptyControls: 0, ruleCandidates: 0, aiCandidates: 0, repeatSections: [] }));
      return true;
    }
    if (msg.type === 'PREVIEW_FORM') {
      previewForm().then(sendResponse).catch(()=>sendResponse({note:'preview-error'}));return true;
    }
    if (msg.type === 'GET_FILL_STATUS') {
      const run = activeFillRun;
      sendResponse(run ? {running:true,runId:run.runId, phase:run.phase, field:run.field, total:run.total, completed:run.completed, cancelled:run.cancelled,timing:run.clock?.snapshot()} : lastManualStatus||{running:false});
      return;
    }
    if (msg.type === 'STOP_FILL') {
      if (activeFillRun) activeFillRun.cancelled = true;
      sendResponse({ok:true, running:!!activeFillRun});
      return;
    }
    if (msg.type === 'FILL_FORM') {
      if (!pendingManualFill) pendingManualFill = (async()=>{
        if(msg.previewToken && !await validFillPreview(msg.previewToken))return {note:'preview-expired',filled:[],failed:[]};
        lastFillPreview=null;
        return runManualFill(!!msg.overwrite, !!msg.useAI, !!msg.selfCheck);
      })()
        .finally(() => { pendingManualFill = null; });
      pendingManualFill
        .then(r => {
          const controls = collectControls(true);
          r.pageFilledCount = controls.filter(controlHasValue).length;
          r.pageEmptyCount = controls.length - r.pageFilledCount;
          sendResponse(r);
        })
        .catch(e => sendResponse({ error: String(e), filled: [], skipped: 0, failed: [] }));
      return true;
    }
    if (msg.type === 'EXPORT_UNMATCHED') {
      (async () => {
        try {
          const st = await chrome.storage.local.get(['profile', 'learned']);
          const lines = collectUnmatched(st.profile || {}, st.learned || {});
          if (!lines.length) {
            toast('未发现未识别字段');
            sendResponse({ ok: true, count: 0, lines: [] });
            return;
          }
          const ok = await copyToClipboard(lines.join('\n'));
          if (ok) toast('已复制 ' + lines.length + ' 个未识别字段到剪贴板');
          else toast('复制失败，请改用截图', 4000);
          sendResponse({ ok: ok, count: lines.length, lines: lines });
        } catch (e) {
          sendResponse({ ok: false, count: 0, lines: [] });
        }
      })();
      return true;
    }
  });

  async function ensureDefaultProfileLoaded() {
    const result=await boundedRequest(chrome.runtime.sendMessage({type:'LOAD_DEFAULT_PROFILE'}),10000);
    if(!result?.ok)throw Error('default-profile-unavailable');
  }

  async function init() {
    try{await ensureDefaultProfileLoaded();}catch{return;}
    const store = await chrome.storage.local.get('settings');
    autoFillEnabled = !!(store.settings && store.settings.autoFill);
    if (autoFillEnabled) {
      setTimeout(async () => {
        const r = await runAutoFill();
        if (r.filled.length) toast('秋招助手：已自动填充 ' + r.filled.length + ' 项');
      }, 500);
      startObserver();
    }
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      const s = changes.settings.newValue || {};
      if (s.autoFill && !autoFillEnabled) startObserver();
      if (!s.autoFill) stopObserver();
      autoFillEnabled = !!s.autoFill;
    });
  }

  init();
})();
