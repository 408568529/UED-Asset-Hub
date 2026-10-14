# Phase D.1 — Windows 隔离资产验收

实测日期：2026-10-13；本轮 Haldur 修复/回归：2026-10-14。全部写入仅在 `%LOCALAPPDATA%/<D1-SYNTHETIC-ROOT>`，标记 `PHASE_D1_SYNTHETIC.marker`。运行账户 `isolated Windows test account`。A 端口 isolated port range (withheld)；B 端口 isolated port range (withheld)。使用原 C2 ZIP：Commit `[restricted historical C2 source identity]`，Tree `7c747f4b5eccb386c759a4bee3172a63f3ac3d46`，ZIP SHA-256 `65f2af222d33090c3daef3e4d8fbe2542fbc4e13ab8496dcbc5cc002965d3475`。D1 安装校验 20,530 个文件通过。DPAPI 合成凭据保留于隔离目录，不记录明文；未配置模型 Key。

## 已完成 Windows 实测

| 能力 | 结果 | 证据位置（Windows D1 根下 `evidence\`） |
|---|---|---|
| Knowledge | 两份 Markdown 创建、读取及重启后 ID/正文哈希保持；Knowledge Gateway MCP 工具发现和两份文档 `search → get` 全文/引用键通过。 | `asset-inspect-a.json`, `asset-inspect-a-restart.json`, `mcp-search-get-a.json` |
| 组件 | 合成组件创建/查询，重启后 ID/名称保持。 | `asset-inspect-a.json`, `asset-inspect-a-restart.json` |
| 字体 | D1 内 Consolas fixture asset volume withheld；上传 201、列表 200，重启后元数据 ID 保持。字体未进 Git/发行包。 | `font-upload-a.json`, `asset-inspect-a-font-restart.json` |
| 培训媒体 | 合成 MP4 asset volume withheld；上传 201；未给标题时由文件名生成；关联路径为 `uploaded:` 且唯一文件位于 A `TRAINING_MEDIA_DIR`；完整流 SHA-256 与源均为 `0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451`；Range `bytes=0-31` 返回 206。无效 `.txt` 返回 400，隔离媒体目录没有 `.txt` 残留。停启后 ID、路径、标题、哈希及 Range 再次核对一致。 | `asset-inspect-a.json`, `asset-inspect-a-restart.json`, `media-negative-and-files.json`, `asset-inspect-a-font-restart.json` |
| 两组路径隔离 | B 对 A Knowledge/组件/媒体 ID 不可见，A 媒体请求返回 404；B 独立创建知识，A 后续重启仍不可见。DATA_DIR 没有被二次拼 `/data`。 | `cross-root-b.json`, `asset-inspect-a-font-restart.json` |
| ACL | D1 根 ACL 为 SYSTEM、Administrators、test account FullControl；test account 实际读写通过，未认证 Hub 写请求被拒绝。没有用第二个受限 Windows 主体实测 NTFS 拒绝，故跨账户 ACL 记 PARTIAL。 | `windows-readonly-inventory.json` |
| Supervisor shutdown | 早期 SSH Ctrl+C 曾留下 stale lock，不作为 PASS。后启用仅限 D1 实例的原生认证 shutdown：HTTP 202、`SCM_STOP`；日志包含 `managed-shutdown-entered`、`metadata-flushed`、`managed-components-converged`、`finalization-completed`；lock 删除、D1 进程数为 0、D1 A/B 隔离端口无监听。 | `controlled-shutdown-response.json`, `controlled-shutdown-final.json`, `final-port-status.json`, `final-d1-process-lock-status.json` |

测试后的合成目录保留。最后 D1 环境复核：D1 marker/root 在，lock 不存在，D1 进程为零，D1 端口均释放。旧 V1、既有 staging 与受保护服务按原状运行；未操作它们。

## Haldur 环境透传缺陷及修复

原 C2 D1 `GET /api/haldur-design-skill` 返回 HTTP 503 `root-missing`。配置 PSD1 中 source/runtime 两根有效，但 `agent-integration/scripts/runtime-boundary.mjs` 的 `assetHubEnvironmentKeys` 未包含 `HALDUR_DESIGN_SKILL_ROOT` 与 `HALDUR_DESIGN_SKILL_RUNTIME_ROOT`，导致 Hub 子进程收不到路径。

本分支的最小修复仅把这两个变量加入 Asset Hub 子进程白名单；DSH、Gateway、Agent Proxy 白名单未扩展。`scripts/verify-agent-runtime-boundary.mjs` 增加了两变量到 Hub 子进程的断言。定向 Agent boundary 和 Haldur foundation/directories/files/markdown/governance/workbench/export 共 8 项 PASS。

**Windows 新 Commit ZIP 构建及 Haldur HTTP/文件/Markdown/ZIP 复验尚未完成。** 新 ZIP 必须使用本分支修复代码的新 Commit 身份；不能沿用上述 C2 ZIP 的测试结果。
