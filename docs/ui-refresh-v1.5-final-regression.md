# UI Refresh V1.5 — 本地验收报告

2026-10-15。仅 `codex/visual-refresh-v1`、持久独立 worktree、合成数据。未使用旧稳定版的运行结果替代本候选验收。

## 最终行为

- 知识库是统一资产展示入口。旧 `/products`、`/components`、`/sops`、`/skills`、`/fonts`、`/prompts`、`/training` 列表兼容跳转到对应知识库分区；Skill/字体/Prompt/培训旧详情兼容跳转到原有知识详情，旧培训文件夹映射到分类。保留 q、Prompt 模型标签、资源存在性校验。管理台、上传、下载、媒体和数据接口不变。
- 搜索页沿用已认可的灰阶、控件、低分割线与留白。搜索结果直接进入原有知识详情，显示“返回搜索结果”，保留 q/type/tag。只允许本地 `/search` 返回目标。外部资源链接维持原行为。没有新建独立详情体系。
- 仅知识库“培训”分区改为封面卡片：桌面三列、中等窗口两列、窄窗单列，8px 圆角、主题绿 #2ccc6c 播放按钮。沿用已有聚合结果、筛选/排序、封面接口和知识详情 URL；缺封面显示图标回退。输入框按卡片列宽计算，其他知识分区仍是原列表。独立培训页不再单独维护新版样式。
- 首页标题、数字、背景粒子/连线、相关悬停与强调线改为已提供千问 Token 主绿 #2ccc6c，构图与动画逻辑不变；没有改全局 --primary。
- Agent 外层导航和工作台栏保持 #141414 深色，使用统一圆角、边框和按钮形态。DSH iframe 内部样式与全高度结构不变。Agent 错误提示保留暗色；Haldur 错误页为浅色背景上的圆角卡片，去掉外围额外白板。
- 文章底部上一篇/下一篇沿用当前筛选排序结果及返回条件；首尾/单篇边界、长标题首行对齐、窄窗堆叠通过。字体授权说明上方多余分隔线移除；Skill 文档切换与版本下载保留。

## Git 与保护边界

- SOURCE_BASELINE：`a3c328ed28718af96670c99d6a790b31e9a541e6`；TREE `d366f59426fe4d5615b65c1fb861bd744114417e`；父提交 `ea8165f3c26461db67891d676e3f3afcd9fbda13`。
- 实施目录：`/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/workspace`。原 cwd 不是修改目录。
- 稳定版本：`b548083c78d1967ec580ee110b51a0927e4e383d`。远端 main 只读核对仍为此提交；原工作树与 Sprint 工作树 HEAD、Tree、状态、差异和 server.js 指纹未改变。
- 最终完整 NEW_COMMIT / TREE / BUILD_ID / WORKTREE_STATUS 见同目录 `RESULT.json`、`source-boundary-audit.json`。报告文档提交不改变已测试源代码。
- DSH Source、Gateway、Knowledge MCP、Proxy、认证、Bridge、会话与 sandbox/CSP 源码未改。AgentShell、AgentOfficialWorkbench、模型设置和字体组件去除 className 后 AST 与基线相同。服务与 API 无差异。
- 前端视觉以外仅用户明确授权的上传事件、弹窗焦点与入口/返回导航修复；不引入新组件库、分页、审核流、Agent 框架或发布流程。

## Haldur 修复与定向回归

| 项目 | 结论 | 实际证据 |
|---|---|---|
| HALDUR_FIRST_UPLOAD | PASS | 基线首次选择已触发 input/change，但没有 POST。原因是 setPendingFile 后上传闭包仍读旧状态；直接传本次 File 修复。25项浏览器测试覆盖3个全新页面首次选择、取消、409覆盖/取消、同文件重选、503重试、并发防重、实际磁盘字节、权限403与ZIP。 |
| MODAL_FOCUS_RESTORE | PASS | Escape/取消/X/合法提交回到仍存在的触发元素；行被移除后回到本工作台 main。Focus Trap、Tab顺序、下拉嵌套和重开通过；未改 Radix Primitive。 |
| VISUAL_FUNCTIONAL_REGRESSION | PASS | 知识库20项搜索/筛选/排序/URL/返回/表单/Milkdown/导入；13项详情导航/字体/设置；6项长标题边界/Markdown保存；4项Skill正文切换/下载字节。原始 JSON 分别保存，故障夹具明确标注。 |
| 最终导航 | PASS | 12个旧地址实际返回307到知识库；关键词、Prompt模型标签、培训文件夹分类正确。浏览器搜索→知识详情→返回搜索保留全部条件；培训搜索→卡片→详情→返回保留查询；文档分区仍显示21行、0培训卡片。 |
| 工程 | PASS | production build、typecheck、git diff --check、Haldur既有定向脚本及GenUI安全静态边界。静态合同与真实模型结果分开记录。 |

首次上传、焦点与早期页面验证绑定207f7c6 / 76ce396；最后追加导航和卡片按当前代码重新构建、核验。不会把旧截图作为最终页面截图。Haldur ZIP 是功能测试导出，不是 Windows Release ZIP。

## 独立运行环境与真实 Agent / GenUI

DSH `dsh-v0.1.1-rc.2`，Commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；GenUI `0.15.1`。使用验证来源的只读 Source 建立独立执行副本，独立 DSH_HOME、Agent Runtime、媒体和合成 Haldur 树。通过现有 `npm run start:host` 管理全部服务；没有新写启动架构。

端口全部 loopback：Hub 3047、内部Hub 3048、DSH3147、Proxy3148、Gateway3149。HTTP本地测试使用OS临时合成DATA，遵循原安全guard。用户明确授权同一3047视觉登录配置只在内存沿用；模型Key由用户自行在受保护页面输入，未读取/复制/回显凭据库或其他实例Key。

| 项目 | 结论 | 实际观察 |
|---|---|---|
| DSH_HUB_RUNTIME | PASS | ready / configured；Hub嵌入真实DSH，会话创建、切换、输入、返回及重启持久化检查。 |
| 真实DeepSeek | PASS | deepseek-v4-flash 实际回答17×23=391。 |
| KNOWLEDGE_MCP | PASS | 实际 search_knowledge / search_micro_specs / get_knowledge_asset；新合成微规范全文 contentStatus=full、hasContent=true、truncated=false，准确回答19px / 27px、LIME-ORBIT-527、Portal边界和精确citation.key。 |
| GENUI_HUB_RENDER | PASS，有首次发现限制 | 模型实际genui_create生成React，受限GenUI预设，Hub内嵌可交互；首次启用需刷新一次发现客户端渲染器。 |
| GENUI_SAVE_REFRESH_AUTO_RESTORE | PASS | 从19改43保存，完整刷新Hub自动恢复43，无恢复点击；最终候选又改61保存并完整刷新自动恢复61。 |
| GENUI_AGENT_STATE_READ | PASS | 新提示不包含修改后的数值，实际genui_state_read分别返回43、61和marker，模型正确读回。最终复验同时完成MCP搜索/正文引用。 |

微规范ID：`micro-spec_ed04a3ba186a4642b1ebc378bef53e75`。
GenUI artifact：`s-533fb6e60cc7-v15-synthetic-param-check`，version：`v-6f3bcb71-9096-4775-b48d-7021f09243ce`。
真实工具证据：`real-agent-genui-result.json`、`real-mcp-dom.txt`、`final-genui-save-dom.txt`、`final-genui-auto-restored-dom.txt`、`final-real-tool-trace.txt`、`final-real-answer-dom.txt`。

**保留问题：** 首次启用GenUI、以及Supervisor冷启动后首次页面加载，可能先显示原始工具回执，需要额外刷新一次才发现renderer。普通刷新自动恢复通过，不代表冷启动首次渲染无问题。本轮未为此改动官方Source、Bridge、Proxy、受限预设或CSP。该初始化行为须单独确认最小处理方式，当前不作可合并结论。

## 浏览器与截图

- 宽度2560 / 1440 / 688检查Agent：顶栏与工具栏均rgb(20,20,20)，iframe延伸到视口底部，无Footer和外层滚动；记录 `agent-final-viewport-checks.json`。
- Haldur错误页使用真实合成缺根路径配置注入，未移动根目录；三宽度卡片无裁切，缺目录没有被创建，重试保持正确失败；配置和正常资源展示已恢复。
- 最终培训卡片与输入宽度、主题色、响应式记录见 `knowledge-training-viewport-checks.json`。合成库仅2项媒体，三列网格的空位不是缺失资源，不为截图伪造数据。
- `comparison.html` 为最终前后对比入口；首页 before/after-home-green-1440.jpg，搜索 before/after-search-1440.jpg，培训 before/after-knowledge-training-1440.jpg，统一知识详情 after-search-canonical-detail-1440.jpg。早期独立培训页截图只保留为阶段证据，最终以知识库入口为准。
- 文章、字体、上传、焦点、设置前后截图及JSON保存在同一证据目录。详细文件清单见比较页与RESULT.json。

## 预览与启动

预览：http://127.0.0.1:3047/knowledge?section=training 。搜索：http://127.0.0.1:3047/search 。Agent：http://127.0.0.1:3047/agent 。仅本机隔离预览，不是部署。

启动方法记录于 `/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/README.md`。停止后运行 `python3 '/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/start-visual-host.py'`；普通重启不重装DSH/GenUI、不重新初始化DSH_HOME。模型Key持久保留在此独立环境；若临时视觉登录配置缺失，需用户提供本环境登录配置，不借用其他实例。

`GIT_PUSHED=false`、`MAIN_MERGED=false`、`WINDOWS_ZIP_BUILT=false`、`PRODUCTION_TOUCHED=false`。

`READY_FOR_VISUAL_REVIEW=YES`。
`READY_FOR_MERGE_CONSIDERATION=NO`：真实交互闭环通过，但首次客户端发现/冷启动行为仍保留，新增视觉也待用户最终验收。未获得合并或部署授权。
