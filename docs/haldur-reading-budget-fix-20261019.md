# Haldur 顺序读取与分页修复（3047，2026-10-19）

## 根因

真实会话 `session-c0a8200d-6fc7-471f-9110-770d4df712a2` 的工具记录与 GenUI **0.15.1** 包源码一致：`src/runtime/discovery-budget.ts` 每来源每轮仅允许 2 次发现、4 次读取，且发现也计入读取；所有来源合计 6 次读取。原回合 1 次搜索 + SKILL.md + 框架第一页 + 列表第一页已占 4 次，设计原则被第 5 次调用拒绝。不是文件丢失、登录失败或模型服务额度不足。

同包行为提示与拒绝文案还要求使用已有部分证据直接回答或创建交互面板，和 Skill 的必读/续读要求冲突。两个长文当时分别只返回 8000/13671、8000/21215 字，不能按已完整阅读处理。

## 最小改动

- 仅现有 `search_haldur_skill`、`get_haldur_skill_document` 使用独立的每轮 **6 次发现、64 页正文**预算。其他 MCP/Web 原限额及工具权限不变；没有增加工具、路由或数据访问范围。
- 原生 GenUI 服务器采用版本与 SHA 锁定的可重复兼容补丁，由现有 Host Supervisor 准备预设时安装。上游 DSH Source 不变，不升级 GenUI。
- 明确 Haldur 意图或调用 Haldur 读取后，在当前助手/当前轮检查入口、入口声明的三个有序页面前置文件、评审标准及所有已开始读取的文档。前置未完成、缺页、跳页、正文哈希不一致或读取失败时阻止 `genui_create` / `genui_update`；普通 GenUI、检查和状态读取不受影响。
- 以连续 `offset/end`、相同 `sha256`、最终 `nextOffset=null` 和 `end=totalCharacters` 认定读全。末页 `truncated=true` 不会误判为缺失。
- 预设要求按实际任务条件选择场景、组件、样式并列出证据；缺证据停止，不用自拟/内置样式补齐，不把旧轮次记忆说成本轮读回。

原服务器 SHA256：`594ae015e9e042fc8a5916522c32c9aea33342f6faa3c1446dbc8f54a171bb04`。
补丁服务器 SHA256：`ede24658fbaf6fd3d1824d401ec328ecc1a7f9a4badc9b2811c5a964ec33dc30`。
未知服务器字节或入口流程契约变更会停止放行，不猜测兼容。

## 验收

证据目录：本次任务产物 `haldur-read-limit-fix-20261019/`（运行数据和凭据不进 Git）。

| 项目 | 结果 | 实际证据 |
|---|---|---|
| 原限额精确复现 | PASS | `unit-tests.txt`：1 搜索 + 3 正文后，第 5 次被拒绝 |
| 有界预算、顺序、失败拦截 | PASS | `verify-haldur-reading-policy.mjs`：缺入口/前置/页、错误、哈希不符、跳页、预算、入口变化、首次读取前的明确 Haldur 意图、助手隔离及轮次重置 |
| 现有权限和其他限额 | PASS | 既有 `verify:agent-genui-boundary`；原非 Haldur 来源限额测试 |
| 真实 Agent 有序读取 | PASS | `real-agent-coverage.json`：SKILL → 原则 → 场景总览 → 框架，再读取任务文件；23 文档、43 页、265410 Unicode 字符 |
| 长文同一快照连续续读 | PASS | 总览 7 页、框架 2 页、列表 3 页等；每页 offset 连续且请求/响应哈希相同，全部末页结束后才有任何生成调用 |
| 引用 | PASS | 正向回答中的 23/23 正文哈希与实际工具结果一致；`real-genui-restored.txt` |
| GenUI 编译、显示与交互 | PASS | 新成果 `s-655cda469009-haldur-refund-order-list`；单号筛选为 TL20260512001、行 refund-01 选中；`real-genui-final.png` |
| 保存、刷新、工具读回 | PASS | 普通刷新及策略重载后条件/选择保留；第 3 轮首个工具为真实 `genui_state_read`，值与操作一致 |
| 真实缺证据负测 | PASS | 最终第 4 轮仅成功读取 SKILL.md，明确列缺口并停止；没有 create/update，`negative-stop.txt/png` |
| 原会话/成果/资产保留 | PASS | 312 个原文件：311 字节不变，1 个原会话只追加 84 字节关闭 seed，原压缩字节前缀哈希一致；无丢失/替换。包含原 9 会话、59 个 GenUI 文件 |
| Typecheck、语法、现有 Haldur 回归 | PASS | `npm run typecheck -- --incremental false`、Node syntax、`verify:haldur-knowledge` |
| 持久化启动依赖 | PASS | 既有运行模块闭包包括安装器和策略；同一启动器、同一 DATA/DSH_HOME 重载成功 |
| Windows/全量视觉合规 | NOT_VERIFIED | 不在本轮范围；未构建 ZIP、未部署、未操作 Windows |

正向生成中模型曾漏传入口源码、写错 artifact id，各触发一次原生参数拒绝并自行纠正。它们没有绕过证据检查、没有覆盖旧成果，完整记录在 `real-agent-trace.json`。第 2 轮早期负测的“本轮已读入口”表述没有本轮工具记录，未作为读回证据；已收紧提示，最终第 4 轮用真实入口调用重新核对。

## 启动与测试边界

3047 继续使用现有持久化启动器及原 DATA、DSH_HOME、模型、Haldur、媒体路径。修复由该启动链安装，不依赖本次临时测试目录。不复制或备份会话数据。

定向测试须传入**原始、未打补丁的** GenUI 0.15.1 `lib/index.js`（可从已批准的本地 tgz 只提取该代码文件），运行：

```bash
node scripts/verify-haldur-reading-policy.mjs /path/to/pristine-genui-0.15.1-lib-index.js
```

这是读取顺序/覆盖与生成门槛，不是新增视觉规则引擎。具体任务选文仍由 Agent 按正文条件决定；23 份文档的测试不代表整包规范或任意模型输出的全量视觉合规。预算仍有上限，耗尽时应列出缺口并停止，不静默跳过。原先已经生成的占位样式成果保留原样，修复不会悄悄重写它们。

本轮只验证 3047，新增 1 个合成验收会话及其成果；未 Push、未部署，未改变稳定环境。
