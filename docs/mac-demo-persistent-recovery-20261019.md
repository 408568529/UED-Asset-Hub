# Mac 3047 持久化恢复候选（2026-10-19）

本轮只准备和验证恢复候选，未启动、切换或重启 3047；未 Push、部署或清理历史 Runtime。检查时 3047 已无监听，回退基线也是停止状态。当前视觉分支为 `codex/visual-refresh-v1`。

## 恢复来源与结果

下文 `runtime` 指 `/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime`。

原启动引用 `/private/tmp/ued-ui-refresh-v1/data` 及同目录的 `environment.json`，二者已不存在。机器 10 月 19 日重启，临时目录随后重建；这与临时数据丢失相符，但没有逐文件删除审计，不能断言具体删除者。旧完整备份此前已按用户要求删除，Git 备份不包含业务 DATA。不能把空平台启动当作恢复。

| 对象 | 本轮结果 | 验证 |
| --- | --- | --- |
| 原 `runtime/data` | 53 个文件保留原样 | 全部匹配历史 `boundary-before.json`；前后哈希未变 |
| 独立 `runtime/hub-data` | 57 个文件恢复 | 与历史 DATA 的 57 个路径及 SHA-256 完全一致 |
| 知识索引 | 22 篇 Markdown，含两篇微规范 | 实际 API 索引、全文与 Metadata 验证 |
| 其他 Hub 资产 | 字体 1、Skill ZIP 1、Prompt 1、培训 2 | 实际 API；合计 27 项知识/其他资产，培训分组另保留 |
| DSH 会话 | 9 份、2,022,004 字节 | 原生 Zstd 帧扫描、逐帧解压，5,329 行 JSON 全部可解析，无截断尾帧；前后 SHA 未变 |
| GenUI 成果 | 47 个文件、19,974,607 字节，7 个顶层目录 | 其中 15 个 JSON 可解析；全部文件前后 SHA 未变 |
| Haldur | 187 个文件 | 访客目录/正文、MCP 入口可读，原树前后 SHA 未变 |
| 媒体 | 2 个文件 | 原路径及前后 SHA 未变 |

DSH_HOME、模型配置、会话、GenUI、Haldur、媒体的配置路径未改变，没有启动第二份 DSH 或写入这些会话。**Agent/GenUI 实际重新打开及真实模型调用为 NOT_VERIFIED**，必须等单独授权启动 3047 后确认；完整解析不能代替运行验收。

## 两篇微规范

| 字段 | 金额规范 | 合成间距规范 |
| --- | --- | --- |
| ID | `micro-spec_2f8e027895e34d12a629f4cce8b91b69` | `micro-spec_ed04a3ba186a4642b1ebc378bef53e75` |
| 标题 | 单位位置与金额展示规范 | V15 合成表单间距验收规范 |
| 分类 | 原始空字符串，界面显示未分类 | 交互规范 |
| 主题 | copywriting | form |
| 关联 | web-component-library、app-component-library、global、portal、retail-app | portal |
| 作者 | UED | Preview fixture |
| createdAt | 2026-10-16T01:40:59.873Z | 2026-10-15T11:00:23.192Z |
| updatedAt | 2026-10-16T01:40:59.874Z | 同 createdAt |
| 正文 SHA-256 | `b28e2b32919da0b193b9e9fa04f4466eb8aa5e5a0fcf77916592aba60d323052` | `665553d90d8d4ea5b18f81e15e03978b785cdc216b1be141942a1860588ad117` |
| Metadata SHA-256 | `87b4d46062867a41cf51545bf5a43d5172bd0ce28eca1ba1cf2c7a88177387db` | `915d322c04ccd5d23b4286b9d846ba207a144d580762ea0a1147187dfeba24c3` |

正文来自当时实际读取的 `rules/*-snapshot.md`。合成 Metadata 来自 `mcp-synthetic-fixture.json`；金额 Metadata 根据历史 MCP 字段、当时服务的序列化格式恢复，并与原始 Metadata SHA 精确匹配后才落盘。没有填入无证据字段，也未用 Downloads 中不同哈希的原稿替换已导入正文。真实金额规范与合成间距规范仍明确区分。

## 安全与功能验收

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| Typecheck | PASS | `tsc --noEmit --incremental false` |
| 独立生产 Build | PASS | Build ID `KrD0tuWMB2binPDM4hrjT`；未覆盖原 `.next-local-test` |
| Mac HTTP 本机限制 | PASS | 显式 `UED_LOCAL_DEMO_MODE=true`，macOS、127.0.0.1 绑定/Origin/端口一致、canonical `root/hub-data`；无 opt-in、非回环、错端口、越界/软链接拒绝 |
| 登录配置权限/保密 | PASS | 原账号密码恢复，0600；权限 0644 被加载器拒绝；错误输出不含密码 |
| 原账号登录/签名 Cookie | PASS | 5647 真实登录与 session 请求；写入的是隔离 DATA 的登录日志 |
| 访客只读/管理保护 | PASS | Haldur 阅读成功、写入 403；模型设置接口仍需登录 |
| 资产与两篇微规范 | PASS | 5647 API 索引、两份完整 Metadata 与正文哈希 |
| Knowledge MCP | PASS | 5649 实际桥接隔离 Hub，5 个工具；检索金额规范，两篇全文/引用正确，Haldur 入口读取成功 |
| Chrome 页面 | PASS | 访客知识库和 Haldur 页面截图；沿用现有样式 |
| Agent 权限与环境隔离回归 | PASS | Runtime boundary、Knowledge Gateway、Haldur Knowledge、MCP 定向脚本 |
| 原目录与恢复候选前后不变 | PASS | 原 DATA/会话/GenUI/Haldur/媒体及候选全量 SHA；原启动文件逐字节不变 |
| 3047 实际启动/会话与 GenUI 重开 | NOT_VERIFIED | 用户明确暂不授权切换；未执行 |

验证只运行独立 Hub 5647 和 MCP 5649，使用 `runtime/recovery-validation/hub-data`，测试结束二者均已停止。未以原 DATA 或恢复候选作为写入目标。浏览器最初缺少 Playwright 自带 Chromium，随后使用本机 Chrome 补测通过，没有安装浏览器。

生产 HTTPS 校验及默认密码限制仍保留。新增配置仅传给 Hub，不传给 DSH；Agent 工具集与授权未扩大。继续使用已有 `start:host` / Host Supervisor，不增加新的 Agent 启动框架。

## 持久化启动与凭据

- 数据候选：`runtime/hub-data`，不替换 `runtime/data`。
- 受保护登录：`runtime/config/visual-login.json`（目录 0700、文件 0600），账号 `visual-review`，密码是原 3047 密码；报告与 Git 不记录密码。
- 原 Session Secret 无法恢复，已在该受保护文件中受控生成新密钥；切换后旧管理员 Cookie 失效，需要重新登录。DSH 会话和 GenUI 成果不受此影响。
- 候选运行配置：`runtime/config/host-recovered-3047.json`，保持原 DSH/媒体/Haldur/模型路径。
- 非敏感模板：`docs/mac-demo.host.example.json`；通用加载器 `scripts/start-mac-demo.py`，`--check` 只校验不启动。
- 本次已验证的构建保留在持久化 `runtime/recovery-validation/workspace`，不是 Git Worktree；其中运行代码的三个文件哈希已与视觉分支核对一致。未来启动入口复用该构建，不需要重新配置 DSH，不依赖 `/private/tmp` 中的脚本或 DATA。运行验证用的临时脚本并非启动依赖。

## 待单独授权后的精确切换与回退

**以下启动步骤本轮未执行。** 用终端前台启动，保留 Ctrl+C 管理能力；不要同时启动旧脚本。

1. 先检查配置（可粘贴；不启动）：

```bash
python3 "/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/recovery-validation/workspace/scripts/start-mac-demo.py" --config "/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/config/host-recovered-3047.json" --login "/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/config/visual-login.json" --check
```

2. 获得启动授权后执行（可粘贴；会启动 3047/3048/3147/3148/3149）：

```bash
bash "/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/config/start-recovered-3047.sh"
```

该入口先检查所有演示端口，存在监听就拒绝，不停止或替换其他进程；随后加载持久化配置，由原 Host Supervisor 启动全链路。打开 `http://127.0.0.1:3047/agent` 后核对原会话及 GenUI，再执行必要的真实模型读取。

3. 需要回退时，在上述前台终端按 **Ctrl+C**，等待 Supervisor 停止其托管组件；执行（可粘贴；只读核对）：

```bash
python3 "/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/config/verify-pre-recovery-state.py"
```

原 `start-visual-host.py` 和 `host-config.json` 从未被替换，快照另存于 `runtime/config/pre-recovery-20261019`。回退回到本轮前的停止状态，不删除候选、不回滚业务写入、不覆盖会话/成果。**这不是旧临时环境的可运行回退**：其 DATA/登录文件本来已丢失，不能声称旧脚本还能启动。如果未来配置被其他操作改变，回退核对脚本会拒绝自动覆盖，需要先检查差异。

## 实际证据

本地证据目录：
`/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/persistent-recovery-20261019/`

- `recovery-receipt.json`：全部恢复依据、Metadata 与哈希。
- `dsh-integrity.json`：9 份原生会话逐帧完整性、行数、GenUI 文件统计。
- `isolated-functional-results.json`：真实隔离 API/MCP 验收。
- `isolated-browser-results.json`、`knowledge.png`、`haldur.png`：浏览器验收。
- `targeted-checks.json`、`check-*.log`：定向检查。
- `protected-before.json` / `protected-after.json`：原目录不变、候选历史匹配、运行代码哈希与 Build ID。

没有恢复会话或正文的已知关键缺口；模型凭据文件保留原位但有效性未重试。Git 只提交支持代码、测试、非敏感模板及本报告，DATA、凭据和会话都不进入 Git。
