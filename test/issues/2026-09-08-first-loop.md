# 第一轮：快手日期范围与日志计数

状态：LOOP-001 日志计数与 LOOP-002 日期范围已在快手演示资料场景实页验证；其他控件问题仍开放。

## 原始证据

- 站点：campus.kuaishou.cn，编辑简历；演示资料，AI 关闭。
- 来源 runId：0af78486-8ea5-409f-a19d-8a59c56a51c2。
- contentBuild：1.15.0-dev；旧扩展 ID：pmelkppmfcekjplgmomffamdaaeajnln。
- 日志：evidence/qiuzhao-run-logs-2026-09-08T10-12-38-370Z.json。
- 已观察：12 个教育、实习、项目日期端点在 date-layer 阶段失败，最终未验证；出生日期和毕业日期的单日期控件可以填写。
- 日志 counts 为 empty=0、nonempty=0、verified=27，不能据此声称页面没有空字段。

## LOOP-001：日志计数保存时机

根因已在代码和最小测试中确认：runManualFill 的 finally 保存日志时，页面计数尚未更新；消息响应阶段才计算计数。修复为在持久化日志之前采集最终控件计数。

test/self-check-regression.cjs 新增持久化计数与响应计数一致性断言，修复前失败（0 !== 1），修复后 7 个场景通过。状态仍为待实页复验。

## LOOP-002：Ant 日期范围打开失败

实页手动点击可以打开双面板，但自动流程报告 choice-open-failed。当前假设为范围输入需要 mousedown/focus/mouseup/click 交互顺序，原实现仅 click；实页根因尚未确认。

content/content.js 仅对日期范围增加鼠标事件序列。test/ant-range-open-regression.cjs 使用最小事件合同模拟，修复前失败，修复后通过；该夹具不能证明快手内部采用了相同事件合同。

## 修改与验证

- 修改：content/content.js；test/self-check-regression.cjs；新增 test/ant-range-open-regression.cjs。
- content/content.js SHA-256：ee8aa361ba1eecd300e8ff46f385116fe7734d2b734eae40c57a85329f3d70c6。
- 16 项 mjs 回归通过；自检 7 场景通过；Ant range 及 SVG click 回归通过。
- DOM 测试使用 QIUZHAO_JSDOM=/private/tmp/qiuzhao-tests.PI8Zwy/node_modules/jsdom；直接运行依赖 jsdom 的脚本会因本项目未安装该依赖失败，指定现有隔离依赖后通过。
- 源码仍为 1.15.0-dev；没有生成或发布新版 ZIP。

## 实页复验阻塞与后续

重载阶段浏览器显示两个同名实例：旧 pmelk... 已关闭，ffbpeapkcmahpodofchodppcplikmmnc 已启用。详情页显示空白，尚未核实启用实例的源码目录。操作过程中工具检测到用户改变了 Chrome 状态。未取得新 runId，不把新实例状态当成修复部署成功。

原未保存页面保留；另开“网申闭环复验”标签用于验证，未填写、清空或保存该页。

下一步：核实启用实例源码目录与本记录哈希对应；在 AI 关闭、演示资料、保留非空内容条件下运行一次填写并自检，导出新日志，检查日期目标值在后续交互后保留且日志计数与响应一致。网站保存不在本轮验证范围内。

## 2026-09-08 实页复验结论

加载阻塞已自行排除：当前 popup 可正常打开，URL 中扩展 ID 为 ffbpeapkcmahpodofchodppcplikmmnc，与当前源码绝对路径的 Chromium 未打包扩展 ID 计算结果一致。旧实例继续关闭，没有删除用户原实例或资料。重载当前实例后使用独立空白页面运行，AI 与覆盖非空字段均关闭。

### 第一遍：发现第二层根因

- runId：4bb08f83-e794-4c71-8160-0e017d59d499。
- 日志：evidence/qiuzhao-run-logs-2026-09-08T11-30-26-060Z.json。
- counts：verified=30、nonempty=33、empty=40；与 popup 响应一致，证实计数修复生效。
- 日期范围全部能打开，只有两组最终保留。失败范围的开始日期选中后，结束日期在 task-start 时 hasValue=true，write-result=false；随后开始日期 value-transition 为 false，表明未完成范围事务被回滚。
- 根因：Ant 的结束日期临时预览被保护非空逻辑误认为原有输入，导致结束任务跳过。

### 补充修复与回归

executeFillPlan 在执行前记录非空控件。只有本轮成功打开的日期事务、结束端点原本为空，才允许写入该临时预览；原有结束日期仍保留。新增 test/ant-range-preview-regression.cjs，修复前固定预览值未变导致断言失败；修复后目标结束日期写入与原有结束日期保护均通过。page-order 模拟补齐新增依赖 controlHasValue。

源码 SHA-256：e60395a948f7db97695c3e24d7c9be960556ce76561cdb533679b2e7db4baa12。
验证：全部 test/*.mjs 回归通过；self-check 7 场景通过；Ant range open、preview 与既有值保护测试通过。版本仍为 1.15.0-dev，没有发布 ZIP。

### 第二遍：实页验收通过

- runId：bec070fc-9937-49b1-8b00-544912d9d661。
- 日志：evidence/qiuzhao-run-logs-2026-09-08T11-36-33-756Z.json（含前一次运行）。
- counts：verified=38、nonempty=41、empty=32；与 popup 一致。
- 12 个范围端点全部 final-check=stable-match；单日期出生日期和毕业日期也保持通过。
- 页面目标值：教育 2019-09 至 2022-06、2022-09 至 2026-06；实习 2024-07 至 2024-09、2025-01 至 2025-04；项目 2024-03 至 2024-08、2024-10 至 2025-03。页面按月份展开为当月 01 日。
- 在后续整页填写完成后，再点击“基本信息”标题失焦，六组值仍与目标一致，可见日历弹层为 0。
- 实页验证使用固定演示资料，未点击保存、暂存或提交；不宣称网站已持久化。

## 下一轮问题队列

新日志仍有 4 个失败控件：recruitmentSource 1 个、educationSchool 2 个、educationMajor 1 个。另有 31 个需人工核对项，不能一律算作程序故障。后续调查直接使用上述最终日志，不以本轮日期通过自动关闭其他观察项。
