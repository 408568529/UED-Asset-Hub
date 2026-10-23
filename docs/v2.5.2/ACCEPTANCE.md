# UED Asset Hub V2.5.2 实际验收报告

日期：2026-10-20。代码基线：`f138506dde7a5e2f197ecb32b7e534568ce93cd3`；版本提交只更新文档。PASS 表示下表范围已验证，不代表所有平台或真实模型全量通过。

| 验收项 | 结果 | 实际证据 |
| --- | --- | --- |
| 独立微规范导航、主题筛选、列表、阅读及旧入口 | PASS | 3047 已有浏览器验收；复用 Knowledge 列表行和阅读器，导航位于 Skill 后 |
| 主题创建、重命名、空目录删除及归类 | PASS | `verify-micro-standards.ts` 20 项合成检查；已有 HTTP 写入/无效主题与权限验收 |
| 管理权限、访客阅读与下载 | PASS | 既有 3047 匿名读/下载 200、管理写 401；没有放宽 Agent 权限 |
| 独立存储、路径/链接/重名/哈希安全 | PASS | 20 项检查包含路径安全、冲突、故障注入及恢复；原 DATA 无覆盖 |
| 用户确认资产根下首次初始化 | PASS | `verify-competition-first-run.mjs`：中文/空格/长路径、未确认拒绝、空索引、已有目录拒绝、缺失根及链接路径 |
| 历史正文、完整 Metadata、ID 和引用兼容 | PASS | 既有 3047 迁移 8→8，正文 SHA-256 及完整元数据一致；旧文件保留；本次未重新执行实际迁移 |
| 合成迁移、幂等、禁止覆盖更新目标、中断恢复 | PASS | `verify-micro-standards.ts`；仅合成临时目录 |
| Knowledge MCP 检索、全文、稳定引用及单真源 | PASS | `verify-micro-standard-gateway.ts` 10 项；`verify-knowledge-gateway-mcp.mjs` 工具/Schema/边界；既有真实 3149 读回 8 篇全文哈希 |
| Skill 目录管理及视觉细节 | PASS | 既有目录服务回归、合成管理员弹窗；3047 实测侧栏 300px、选择/展开分离、标题及正文背景一致 |
| Typecheck / production Build | PASS | 本次 `tsc --noEmit --incremental false`；最近 `f138506` 对应 production Build 已通过，本次仅文档，无需重建 |
| 原资产、会话和 GenUI 文件保留 | PASS | 既有逐文件哈希：Hub58、微规范9、Haldur187、媒体3、会话14、GenUI86文件未变；本次不修改运行数据 |
| 本轮真实模型按 SKILL 流程生成 | NOT_VERIFIED | 没有调用模型；不能用 MCP/HTTP 通过代替模型端到端验收 |
| Windows 原生首次初始化/运行 | NOT_VERIFIED | 共用初始化合成测试通过；本次不构建 ZIP、不部署 Windows |
| Windows 正式资产迁移 | NOT_EXECUTED | 本轮明确不执行正式数据迁移或部署 |

详细存储及回退方法见 [迁移说明](../micro-standards/STORAGE-AND-MIGRATION.md)。本机原始证据保存在 `roadshow-output/micro-standards-20261020`、`micro-ui-unification-20261020`、`skill-sidebar-300-20261020`、`skill-header-background-20261020` 的验收记录中；这些运行证据、实际资产、凭据和会话不会因版本提交加入 Git。

提交前安全检查覆盖本轮变更及待上传历史中的私钥、常见真实 Token、凭据赋值和运行数据路径；测试固定值/占位符与实际凭据分开核对。检查结果与 Push 的最终提交/Tree 以交付记录为准，不将计划写作成功。

## 本次提交前复核结果

- `verify-micro-standards.ts`：PASS，20 项。
- `verify-micro-standard-gateway.ts`：PASS，10 项，模型调用 0。
- `verify-knowledge-gateway-mcp.mjs`：PASS，工具与输出 Schema 契约。
- `verify-haldur-knowledge.ts`：PASS，路径、分页快照、引用、认证及无运行数据初始化。
- `verify-competition-first-run.mjs`：PASS，沿用确认机制、用户选择的资产根及独立目录。
- `tsc --noEmit --incremental false`、`git diff --check`：PASS。
- Git 待上传历史扫描：56 个提交、404 个文件版本；7 处凭据赋值模式命中全部为合成测试固定值，未解决项 0；未发现私钥、常见真实 Token 或运行凭据目录。提交文件仅 README 和版本文档，不包含运行数据。
- GitHub 只读核对：`main` 为 `b548083c78d1967ec580ee110b51a0927e4e383d`；没有同名开发分支。本次仅尝试创建/推送 `codex/v2.5-competition-delivery`，不修改 main。Push 是否成功及最终 Commit/Tree 将在执行后单独报告。
