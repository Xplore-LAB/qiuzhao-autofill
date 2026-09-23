const assert=require('node:assert/strict');
const {parseResume}=require('../shared/resume-parser');
const text=`个人简历
姓名：演示同学 | 手机：+86 138 0000 0000 | 邮箱：demo@example.com
出生年月：2000年02月
教育背景
浙江大学 | 计算机科学 | 本科 | 2020.09 - 2024.06
北京大学 | 软件工程 | 硕士 | 2024.09 - 2027.06
实习经历
演示甲公司 | 研发实习生 | 2025.06 - 2025.09
维护自动化测试，提升覆盖率。
演示乙公司 | 测试实习生 | 2026.06 - 至今
负责测试报告。
项目经历
项目名称：演示检索平台
时间：2024年03月 至 2024年06月
项目角色：开发
项目描述：实现索引和查询。
项目名称：演示数据工具
时间：2025.01 至 2025.03
项目描述：完成数据校验。
获奖情况
奖项：演示奖学金 | 获奖时间：2023-10 | 级别：校级
奖项：演示竞赛奖 | 获奖时间：2024-05
语言能力
CET-6 560
自我评价
乐于协作，重视测试。
紧急联系人
姓名：演示联系人 | 手机：13900000000 | 邮箱：contact@example.com`;
if(require.main===module) {
 const result=parseResume(text),p=result.profile;
 assert.equal(p.name,'演示同学');assert.equal(p.phone,'13800000000');assert.equal(p.email,'demo@example.com');
 assert.equal(p.birthDate,'2000-02');assert.equal(p.degree,'硕士');assert.equal(p.school,'北京大学');assert.equal(p.major,'软件工程');assert.equal(p.graduationDate,'2027-06');
 assert.deepEqual(p.educationBulk.map(r=>[r.educationSchool,r.educationStartDate,r.educationEndDate]),[['浙江大学','2020-09','2024-06'],['北京大学','2024-09','2027-06']]);
 assert.equal(p.internshipsBulk.length,2);assert.equal(p.internshipsBulk[1].internshipEndDate,'至今');
 assert.equal(p.projectsBulk.length,2);assert.equal(p.projectsBulk[0].projectDescription,'实现索引和查询。');
 assert.equal(p.awardsBulk.length,2);assert.equal(p.englishLevel,'CET-6');assert.equal(p.englishScore,'560');
 assert.equal(p.intro,'乐于协作,重视测试。');assert(result.evidence.educationBulk.includes('浙江大学'));
 assert.equal(p.idNumber,undefined);assert.equal(p.willingAllocation,undefined);
 const en=parseResume('Name: Demo Candidate\nEmail: demo@example.com\nEducation\nExample University | Computer Science | Bachelor | 2020-09 to 2024-06\nInternships\nExample Company | Intern | 2024-07 to Present\nBuild tests.').profile;
 assert.equal(en.name,'Demo Candidate');assert.equal(en.educationBulk[0].educationSchool,'Example University');assert.equal(en.internshipsBulk[0].internshipEndDate,'至今');
 const ambiguous=parseResume('邮箱：first@example.com\n邮箱：second@example.com\n邮箱：first@example.com\n手机号：13800000000\n手机号：13900000000');
 assert.equal(ambiguous.profile.email,undefined);assert.equal(ambiguous.profile.phone,undefined);assert(ambiguous.warnings.some(s=>s.includes('不同值')));
 const invalid=parseResume('出生日期：2001-02-29\n教育经历\n学校：演示大学\n时间：2024.13 至 2025.02\n项目经历\n项目名称：演示项目\n时间：2025.03 至 2024.01');
 assert.equal(invalid.profile.birthDate,undefined);assert.equal(invalid.profile.educationBulk[0].educationStartDate,undefined);assert.equal(invalid.profile.projectsBulk[0].projectStartDate,undefined);
 assert.equal(parseResume('手机号：138****0000').profile.phone,undefined);
 assert.equal(parseResume('工作经历\n正式公司 | 工程师 | 2023-01 至 2024-01').profile.internshipsBulk,undefined);
 assert.equal(parseResume('教育经历\n学校：演示大学\n专业：计算机\n学历：本科\n时间：2020-09 至 2024-06').profile.major,'计算机');
 const inline=parseResume('教育经历\n学校：演示大学 / 专业：计算机 / 学历：本科 / 时间：2020-09 至 2024-06').profile;
 assert.equal(inline.school,'演示大学');assert.equal(inline.major,'计算机');assert.equal(inline.graduationDate,'2024-06');
 assert.equal(parseResume('项目经历\n演示平台\n2024.03 - 2024.06\n负责开发。').profile.projectsBulk[0].projectName,'演示平台');
 assert.equal(parseResume('获奖情况\n2024.05 演示奖学金').profile.awardsBulk[0].awardName,'演示奖学金');
 assert.deepEqual(parseResume('无法确定的正文 123').profile,{});
 assert.throws(()=>parseResume('x'.repeat(300001)),/30 万/);
 console.log('PASS local resume parser: Chinese/English, contacts, multi-record education/internship/project/award, provenance, ambiguous values, invalid dates, unsupported sections');
}
module.exports={text};
