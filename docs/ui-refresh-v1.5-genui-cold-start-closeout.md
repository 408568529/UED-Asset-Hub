# UI Refresh V1.5 — GenUI 冷启动收尾验收

2026-10-16（Asia/Shanghai）。结果：PASS，可进入视觉分支最终审查；不包含合并或部署授权。

开发分支 `codex/visual-refresh-v1`；本轮起点 `552cf8ed451cf51a71b218f331e69b72a2c88d87`，包含已认可的 `377f3b6b2cf6481661d96864a69e0d53d6d27f05`。稳定基线 `b548083c78d1967ec580ee110b51a0927e4e383d` 未变。

## 最小修复与根因

冷启动首次 Hub 工作台的 `__DSH_BOOT__` 清单缺少 `dsh-plugin-genui`。已有会话恢复后服务端才挂载受限 GenUI 预设，原浏览器引导清单不会自动增加这个 renderer。首次没有创建预览 iframe，尚未进入 Bridge 握手；额外刷新后清单有此客户端、预览恢复。故障先于 artifact 资源/握手，不是旧屏幕外恢复机制复发。

新增一个 Host 集成适配包，通过官方 `webserver/index-inject` 扩展点为首个页面补齐锁定客户端条目，通过官方 exact route 提供同一份只读客户端字节。已有清单包含 GenUI 时不重复注册，不修改官方 module registry。现有 Supervisor 把这个小包复制到本隔离 profile；没有新启动框架、定时器、预热会话、模型重试或页面自动 reload。

客户端必须为 GenUI 0.15.1、既有 `ued-visible-readiness-v2` 补丁 SHA256 `2cc6256717f1265494a125914e063082c5061a395cf44596fa720243e5cfd6eb`。DSH Source 保持 `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e` 且 Git clean。受限预设、Bridge、Proxy、CSP、sandbox、grant、TTL、认证与会话机制均未修改。仅提供 renderer 不启用 Agent 工具，工具/预览路由仍由显式受限预设挂载。

## 完整验收表

证据目录 E：`/Users/zhouzhijun/.codex/visualizations/2026/10/15/01a13dd9-7d6b-7351-a5f5-2b8bdeed1d96/ui-refresh-v1.5/cold-start-closeout/`。表内文件名均相对 E；历史 H 表示 E 的上一级，历史报告保留原样。

| 项目 | 状态 | 实际结果与证据 |
|---|---|---|
| 首次故障定位 | PASS | `first-failure.json`：清单无 GenUI、无预览 iframe；`refresh-comparison.json`：刷新后清单有 GenUI、1 个预览 iframe。没有记录 grant、Cookie、Key 或 HAR。 |
| 冷启动 1：就绪后首次进入 | PASS | 受控停止并确认五端口释放，再使用同一启动配置进入 Hub；首开清单含 GenUI，自动恢复原参数 61，无人工刷新。`cold-cycles.json`、`cycle1.jpg`。 |
| 冷启动 2：初始化期间进入 | PASS | Hub 可访问、DSH/Proxy 尚未监听时进入；页面显示 `starting-proxy`，随后自动显示同一 artifact 并恢复 47/38/true。`cycle2-entering.txt`、`cycle2-starting.txt`、`cycle2-starting.jpg`、`cycle2-ready.txt`。 |
| 冷启动 3：知识库入口切回 | PASS | 再次受控停栈、五端口释放后启动；从知识库正常导航进入 Agent，首开自动恢复 47/38/true。`cycle3-entering.txt`、`cycle3-ready.txt`。 |
| 三项参数修改与保存 | PASS | 同一 artifact 最小增补行高、紧凑模式后，实际修改字段间距 47、行高 38、紧凑模式 true；点击保存一次，saved-params 与官方 reportResult 一致。`interaction.json`、`three-parameters-saved.jpg`、`real-tool-trace.txt`。 |
| 普通刷新自动恢复 | PASS | 正常页面刷新后无需“重新打开”，恢复 47/38/true。`refreshed-three-parameters.jpg`、`interaction.json`。 |
| 屏幕外滚出与返回 | PASS | 预览原先在历史消息屏幕外；滚回后 iframe 正常显示，行高保持 38，无加载失败。`offscreen-return.jpg`、`final-preview.jpg`、`representative-ui.json`。 |
| 后台标签返回 | PASS（人工） | 用户在本轮明确回复“切回后预览正常，无需刷新”。工具不能真实改变 visibilityState，因此不冒充自动化通过。`representative-ui.json` 记录证据来源。 |
| 真实 DeepSeek Agent 工具读回 | PASS | 提示未泄露 47/38/true；实际 `genui_state_read` 读回同一 artifact 的三项值，回答与工具一致。`real-tool-trace.txt`、`real-answer.txt`。 |
| Knowledge MCP 检索 | PASS | 实际 `mcp__asset_hub__search_knowledge` 检索合成微规范，随后调用全文工具。`real-tool-trace.txt`。 |
| Knowledge MCP 全文与引用 | PASS | `mcp__asset_hub__get_knowledge_asset` 返回 hasContent=true、truncated=false、partial=false；全文为 19px/27px、LIME-ORBIT-527，准确引用 `asset-hub://knowledge/micro-spec/micro-spec_ed04a3ba186a4642b1ebc378bef53e75`。`full-knowledge-tool.txt`。 |
| Haldur 首次选文件上传 | PASS（复用） | Commit `207f7c6b0056992546bfb19145551ae7e9cf6cc9`；历史 H/haldur-browser.json 中三次全新页面首次选择均 requests=1、diskMatches=true；含取消、覆盖、错误重试与并发防重。H/after-first-upload-1440.png。本轮未修改 Haldur。 |
| Haldur 弹窗焦点恢复 | PASS（复用） | 同一历史 25 项浏览器证据，覆盖 Escape/取消/关闭/提交、菜单嵌套及触发器移除后的可见工作台 fallback。H/haldur-browser.json、H/after-focus-restored-1440.png。 |
| 知识库与搜索来源返回 | PASS | 真实点击搜索结果进入知识库 Skill 详情，返回保留 q=界面检查、type=skill、tag=合成。`representative-ui.json`；原有栏目类型修复保留。 |
| 培训旧入口、视频播放 | PASS | 12 个旧 URL 仍重定向知识库并保留参数；合成视频 readyState=4，实际播放至 ended=true、currentTime=duration=1.938058，error 无。`canonical-route-checks.json`、`representative-ui.json`。 |
| AI Skill 预览/Markdown/版本/下载 | PASS | 预览正文存在，点击 Markdown 后 radio checked 且显示源文；版本 v1.0.0、ZIP 真正下载成功。`representative-ui.json`。 |
| Agent 全高度与切页 | PASS | 当前 viewport 1382×1344、iframe y=121/bottom=1344，无 Footer、无外层滚动；从知识库切回保持原测试会话与保存状态，无新建会话。`agent-layout.json`、第三轮证据。 |
| 客户端资源认证边界 | PASS | 登录后客户端路由 200（112525 bytes）；匿名 401。`runtime-and-client-route.json`。 |
| Typecheck / Build | PASS | 独立 tsc --noEmit --incremental false 退出 0；停止运行栈后 build 退出 0，恢复同一 standalone 预览。`build.log`。 |
| 定向边界与 Supervisor | PASS | verify:agent-genui-boundary、verify:agent-boundary、verify:runtime-supervisor 通过。`genui-boundary.log`、`agent-boundary.log`、`supervisor-check.log`。 |
| 启动适配定向检查 | PASS | verify-genui-client-bootstrap：锁定版本/字节身份、清单不可变、重复条目防重、错误身份拒绝。未引入超时或重试。 |
| 稳定工作树保护 | PASS | 对照 V1.4 原记录，两个受保护工作树 HEAD/tree/branch/status/diff/server.js 指纹相同。`protected-worktrees.json`。 |

连续三轮均使用同一 runtime、DSH_HOME、profile、测试会话与 artifact；浏览器缓存和存储沿用，未做“无缓存首访”声明。第一轮通过后，为三参数验收在同一 artifact 上增加了两个字段，第二、三轮使用这个更新版本；没有换环境或新建 artifact。观察时间见 cold-cycles.json，是采样时间，不冒充完整 Network 请求时间线。

交互验收 artifact：`s-533fb6e60cc7-v15-synthetic-param-check`，更新版本：`v-2d4790be-d8e5-46be-bfd9-529c77c5f7c1`。单次保存操作按 SDK 设计分别调用 setSaved 与 reportResult；不把一次 UI 保存等同于一个 HTTP 写请求。本轮未做重复模型调用或重复 artifact 创建，也未为初始化执行自动写入。

## 重启与当前实例

预览：http://127.0.0.1:3047/agent 。模型设置：http://127.0.0.1:3047/agent/settings 。最终保留一套健康视觉隔离栈，Hub 3047/3048、DSH 3147、Proxy 3148、Gateway 3149，均 loopback。

非敏感配置：`/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/host-config.json`；说明：同目录 README.md。持久会话/模型配置/插件/artifact 沿用，不重复初始化。

停机：先检查 3047 的 PID 与 cwd 确为本视觉工作树的 `scripts/host-supervisor.mjs`，仅向该 Supervisor 发送 SIGTERM；等待五端口释放。不能复制本文中的历史 PID。启动命令（可粘贴；仅在该隔离栈已停止后执行）：

```bash
python3 '/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/start-visual-host.py'
```

启动自动安装本分支的只读 bootstrap 小包，仍使用既有 npm run start:host。无需重新配置 DSH，无需重新输入已保存的 Key。前端若重建，先停本栈，再 build/复制 static 到 standalone，再启动；不在运行时覆盖构建目录。

PUSHED=false；MERGED=false；DEPLOYED=false；WINDOWS_ZIP_BUILT=false。最终提交与 clean 状态见本轮结果 JSON 和最终回复。历史报告中的“冷启动需要额外刷新”由本报告取代；其他历史验收记录不覆盖、不重写。
