# 第二轮：候选问题诊断丢失

状态：诊断信息丢失缺陷已实页验证修复；原有资料不匹配/缺候选/歧义项仍待处理。

## 来源与实际问题

来源 runId：bec070fc-9937-49b1-8b00-544912d9d661；站点 campus.kuaishou.cn，演示资料，AI 关闭，overwrite=false。
证据：evidence/qiuzhao-run-logs-2026-09-08T11-36-33-756Z.json。

4 个失败控件的执行阶段已经有具体原因，但被 choice-option-unavailable 与最终 not-verified 覆盖：

- 招聘来源：no-matching-options；演示值“学校就业网/就业公众号”无法与单一选项匹配。实页分别提供“学校就业公众号”“校园就业网”等，不能替用户决定来源。
- 学校两项：no-visible-options；实页搜索“演示大学”显示“暂无数据”。另一学校仅有日志证据，尚不能认定网络、名称或适配器是哪一个原因。
- 高中专业：ambiguous-options；实页搜索“理科”返回“地理科学”“管理科学”“管理科学与工程”，均不应作为“理科”的确定对应项。

本轮不改变用户资料或放宽选项匹配，不将未填写项标成成功。

## 修复

content/content.js 保留候选具体失败原因；executeFillPlan 捕获本任务新增诊断到该控件的审计记录，runSelfCheck 透传到终验。已有输入、恢复成功、网站校验和节点替换的优先级保持原逻辑。

popup/popup.js 为三种原因提供中文解释。shared/feedback-loop.js 将无匹配归入资料核对，无候选/歧义归入人工调查，而不是一律控件故障。没有候选不等于已证明缺资料或网络故障。

## 最小回归

新增 test/choice-diagnosis-regression.cjs：三个同名控件分别保留自身原因；恢复成功不被旧故障覆盖；已有输入保护仍优先。修复前断言失败，三个原因都变为 not-verified；修复后通过。

全部 test/*.mjs、feedback-loop、run-logs 回归通过；自检 7 场景、日志弹窗和自检弹窗 DOM 测试通过。remote-select 模拟补齐新增的候选查询依赖，异步等待及零错误点击断言通过。

版本仍为 1.15.0-dev，未发布 ZIP，未提交网站简历。

## 实页验收

runId：51966285-73c8-45f3-81f6-736d315d24d3。
日志：evidence/qiuzhao-run-logs-2026-09-08T12-00-06-024Z.json。
当前源码实例 ffbpeapkcmahpodofchodppcplikmmnc 已重载，在新的快手编辑简历页，以相同 Demo、AI=false、overwrite=false 运行。

- 终验 control 41 recruitmentSource：no-matching-options。
- 终验 control 49、55 educationSchool：no-visible-options。
- 终验 control 50 educationMajor：ambiguous-options。
- popup“填写问题分析”实页显示三种中文分类及处理建议。
- counts 为 verified=38、nonempty=41、empty=32，保留原始未完成结果，没有把改变分类当成填充成功。
- 日期范围 12 个端点全部终验通过，随后 DOM 读取仍保持六组原目标值。高中专业和招聘来源仍显示请选择，未误选近似候选。
- 网站保存、提交未执行。

### 源码标识

- content/content.js SHA-256：7207d55f69032d0cf41205046afb067eb1319b27e6dada0c996b8ffec68dd09a。
- shared/feedback-loop.js SHA-256：c82ad518139f22cb8a857a953eae80f27566079995c59d04ae1bd197968e762e。
- popup/popup.js SHA-256：b802c1a7660543ecb505a4ac7a6952ead462f73583fd0a730dedce81f2206eef。
