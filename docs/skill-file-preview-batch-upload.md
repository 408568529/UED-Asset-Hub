# Skill 批量上传与 HTML / SVG 安全预览

2026-10-16。基线 V2.3：`5065f7ec1f69ac4f35fed8c513410a2bbd182cbf`；独立分支 `codex/skill-file-preview-batch-upload`。本轮仅本地提交，不 Push、不合并、不部署。

## 改动与复用

- 批量选择和拖拽使用已安装的 Ant Design 6.6.6 `Upload.Dragger`，受控列表只入队，一次确认后串行提交原始文件流；没有新增批量 API、任务后台或依赖。
- 每项成功采用服务端 snapshot 的新 revision。目标目录固定；批内等价重名阻止提交，现有同名项明确跳过或覆盖。遇到 revision、权限、恢复状态等全局问题暂停；普通已确认失败可以继续其他项。
- 未知结果不自动重试。提供目标 checksum 与本地文件 SHA-256 核对；一致表示当前目标字节一致，不冒充对历史请求结果的证明。文件超过 16 MiB 时不自动整文件哈希核对，需人工检查。
- 上传结束自动读取最新目录，保留逐项状态。停止后续上传不会中断当前文件写入。
- 文件名及目标目录的 header 增加 `uri-v1` 编码标记，服务端仅解码一次，再使用原路径检查；兼容无标记的旧 ASCII 请求。
- 新 Ant Modal 复用现有 KnowledgeThemeProvider，使用局部类名；桌面最大宽 1280px、圆角 12px、高度上限 92dvh。没有修改全局主题、Header、AppChrome、Agent 或 GenUI。新 Modal 局部关闭缩放过渡，避免嵌套 iframe 初次点击时父层仍移动；不影响其他弹窗。
- HTML 弹窗与新标签都加载同一个可信只读查看器 `/api/haldur-design-skill/preview/view?path=...`。新标签链接有 `noopener noreferrer`，刷新可重新读取，不依赖原弹窗的 Blob 存活。
- SVG 在 img 图像上下文显示；原 Markdown 阅读、源码和编辑流程保持不变。

## 安全与支持范围

查看器是受现有 `haldur.read` 检查的可信外壳，原始 HTML 不在宿主 DOM 执行。外壳响应的 CSP 只允许子框架加载内存 Blob；内部文件使用 opaque-origin `sandbox="allow-scripts"`，没有 same-origin、表单、弹窗、顶层导航或下载权限，另有更严格 CSP 禁止 connect、worker、object 和嵌套 frame。CSP 仅属于这个查看器响应，不影响 Agent 的既有策略。

UTF-8 HTML 使用浏览器原生惰性文档解析，在内存中准备静态依赖后再放入隔离框架。保留 html/body 属性，显式设置 UTF-8；绝不写回原文件。内部文档在原生 load 后才显示，避免普通 defer 脚本尚未绑定就能点击；没有定时重试或自动刷新，交互是否成功仍通过真实点击单独验收。CSS 使用原生 CSSOM，普通 JS 与图片转换为受控 data URI，避免 opaque-origin 读取宿主 Blob 的兼容问题。

支持同目录及受控子目录的声明式 stylesheet、普通 script、img、基本 srcset、CSS url() 图像，以及常见 `./assets/...` 引用。资源每次均检查权限、路径、入口仍存在、目录范围和全部路径段的符号链接。禁止跨根、父目录、绝对地址、重复编码、隐藏文件和非白名单类型；缺失资源逐项显示。

读取预算：入口 2 MiB，单资源 4 MiB，单次查看最多 128 项、累计 16 MiB。不是通用网站执行环境：不支持 CSS @import、模块/dynamic import、运行时构造资源路径、后端 API、外部 CDN、Worker、构建 JSX/TSX；字体文件不在当前资源白名单，data URI srcset 不支持。路径包含空格、中文、括号及 `#` 时，HTML 中的 URL 仍须按正常 URL 规则编码。

访客继续允许预览、阅读、下载；写入、覆盖、删除和管理仍由管理员控制。原下载继续 attachment + nosniff，不把 Haldur Root 挂到 public，不复用 GenUI 授权。

## 覆盖失败修复

先在新的合成目录注入 `rename(payload, target)` 失败，基线可复现原文件丢失：旧文件已移至 staging，但事务尚未标记 mutated，错误分支清理了原备份。

仅增加上传的“已移动原备份”状态，使该局部失败进入原回滚流程。回滚成功恢复原字节；再次注入备份还原失败时，保留 staging 原文件并进入 recovery-required，后续写入被拒绝。没有重构其他事务或修改原运行目录。

## 验收与证据

所有写入、故障注入和攻击样例仅位于新合成目录 `/private/tmp/ued-skill-file-tools-test` 或定向脚本自行创建的临时目录。测试地址 `http://127.0.0.1:5447/haldur-design-skill`；外部请求合成接收器只监听本机 5449。测试使用新生成的管理员配置，无模型 Key，不读取原环境凭据。

| 验收项 | 结果 | 证据 |
|---|---|---|
| 10 个混合文件一次提交、revision 串行续用、自动刷新及保留结果 | PASS | upload-browser.json；上传前后截图 |
| 真正拖拽、多选、中文/空格/括号/# 文件名、等价重名 | PASS | upload-browser.json；header 与文件服务测试 |
| 跳过、显式覆盖、单项失败继续、停止后续 | PASS | upload-browser.json |
| 请求响应丢失后不重试、人工点击哈希核对 | PASS | unknownReconciledWithoutRetry |
| 201 缺少可靠结果时暂停、批内其他用户更新产生 revision 冲突 | PASS | legacy-and-integrity-browser.json |
| HTML 内联交互、相对 CSS/JS/SVG 与背景图、./ 路径、body 属性 | PASS | preview-browser-security.json、legacy-and-integrity-browser.json |
| 弹窗与新标签复用；原弹窗关闭、新标签刷新后可用 | PASS | upload-browser.json、preview-browser-security.json |
| SVG 图像显示，脚本/事件不执行，缺失资源提示 | PASS | preview-browser-security.json |
| 宿主 DOM、Cookie、存储访问拒绝；Hub 写接口及外部接收器零请求 | PASS | preview-browser-security.json；接收器覆盖 fetch/beacon/WebSocket/image/script/form/top/popup/自导航/meta |
| 路径越界、双重编码、符号链接、超限与非 UTF-8 | PASS | verify-haldur-file-preview.ts |
| 焦点恢复、1440/1280/1024/390 宽度及短窗口 | PASS | upload-browser.json、production-smoke.json；Modal 各宽度截图 |
| Markdown 阅读/源码/真实编辑保存、目录创建 | PASS | legacy-and-integrity-browser.json；既有目录/Markdown 定向脚本 |
| 原文件哈希、attachment 下载、整个 ZIP 名称与字节 | PASS | legacy-and-integrity-browser.json、zip-byte-verification.json |
| 覆盖失败恢复与恢复失败保护 | PASS | verify-haldur-overwrite-failure.ts；基线故障记录 |
| Agent 静态边界与隔离环境页面加载/切换 | PASS | agent-boundary.log、legacy-and-integrity-browser.json |
| Typecheck、Next 生产构建、diff 检查 | PASS | unit.log、build.log |
| 3047 Skill revision、原 HEAD/status/README | PASS | protected-environment.json，187 个真实导入文件保持不变 |
| 新增能力的 Windows 原生运行、真实模型/GenUI 重新回归 | NOT_VERIFIED | 本轮范围外；没有构建 Windows ZIP 或启停原服务 |

本轮浏览器实测为本机 Chrome，不宣称所有浏览器或任意 HTML 都兼容。安全结论对应上述实际攻击样例，不等于对整个浏览器平台的形式化证明。被阻止的 iframe 自导航可能显示浏览器错误页；可信外壳给出说明，用户可关闭后重新打开，没有自动循环刷新。

## 定向测试与本机验证

```bash
npm run verify:haldur-file-preview
npm run verify:haldur-overwrite-failure
npm run verify:haldur-design-skill-files
npm run verify:haldur-design-skill-markdown
npm run verify:haldur-design-skill-export
npm run verify:agent-genui-boundary
npm run verify:agent-boundary
npm run typecheck
```

浏览器脚本是独立测试工具，复用本机 Playwright，不增加产品依赖。准备脚本要求全新合成目录，存在时拒绝覆盖；切勿把 3047 的目录作为测试根：

```bash
python3 scripts/prepare-haldur-file-tools-test.py
```

这只创建独立合成文件和本轮随机测试登录配置（Git 外、0600），不启动服务、不装 DSH、不读取其他凭据。Next 测试进程使用该目录 test-env.json 中的环境和 5447 端口；运行 `verify-haldur-preview-browser-security.cjs`、`verify-haldur-file-tools-browser.cjs`、`verify-haldur-file-tools-regression.cjs`。可通过 `PLAYWRIGHT_MODULE` 指定已安装的 Playwright 模块路径。原演示环境不需要任何操作。

凭据、运行数据、fixture ZIP、构建输出和截图均不提交 Git；外部截图/JSON 是验收证据，不是运行数据备份。


本轮保留的预览使用同一独立工作树的 `.next-local-test/standalone/server.js`，不是 3047 演示服务。构建和静态文件均来自本轮工作树；本机测试环境说明与启动配置在 `/private/tmp/ued-skill-file-tools-test`，其中随机测试凭据不进入 Git。当前前后截图使用不同数据集：基线为 3047 的只读页面，新增功能截图为 5447 的合成文件，不能据此作同一内容的像素还原结论。
