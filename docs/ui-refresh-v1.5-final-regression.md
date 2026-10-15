# UI Refresh V1.5 — 本地修复与真实回归

日期：2026-10-15。仅 `codex/visual-refresh-v1` 的持久独立 worktree；合成测试数据。本报告区分真实模型闭环、浏览器故障夹具和静态边界检查。

## 版本与范围

- SOURCE_BASELINE：`a3c328ed28718af96670c99d6a790b31e9a541e6`；TREE `d366f59426fe4d5615b65c1fb861bd744114417e`；父提交 `ea8165f3c26461db67891d676e3f3afcd9fbda13`。
- 修复提交：`207f7c6b0056992546bfb19145551ae7e9cf6cc9`、`76ce396895bc2fb27152a7ed8c7cc70aec91bf9d`；最新视觉代码提交 `dccad61`，完整身份见相邻 `source-boundary-audit.json`。
- 稳定版本 `b548083c78d1967ec580ee110b51a0927e4e383d`；受保护原工作树与 Sprint 工作树指纹均未改变。远端 main 只读核对仍指向 b548083c。
- 原 cwd 不是实施目录。实际目录：`/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/workspace`。
- 前端之外仅用户明确授权的首次上传事件与焦点恢复修复。DSH Source、Gateway、MCP、Proxy、认证、Bridge、会话和 sandbox/CSP 源码未修改。AgentShell / AgentOfficialWorkbench / 模型设置 / 字体组件去除 className 后 AST 与基线相同。

## 修复与定向验证

| 项目 | 结论 | 证据与边界 |
|---|---|---|
| HALDUR_FIRST_UPLOAD | PASS | 基线浏览器首次选择已触发 input/change，但未发 POST；原因是刚 setPendingFile 后上传闭包仍读取旧状态。改为直接传本次 File，保留原服务与覆盖协议。25 项 Haldur 浏览器验证含首次选择、取消、409、503 重试、并发防重、磁盘字节一致、权限 403、实际 ZIP。 |
| MODAL_FOCUS_RESTORE | PASS | 原触发元素仍存在则恢复；行被删除/改名后回到本工作台 main。Escape、取消、关闭、合法提交、Focus Trap、Tab 顺序和下拉重开验证通过。未改 Radix Primitive。 |
| 知识库功能 | PASS | 20 项搜索/筛选/排序/URL/返回/校验/新建/编辑/Milkdown/导入验证；13 项详情导航、非文章隐藏、字体、设置检查；6 项长标题对齐、单篇边界、Markdown 保存；4 项 AI Skill 正文切换与下载字节。对应 JSON 单独记录。 |
| 文章上一页/下一页 | PASS | 沿用现有筛选排序结果，无新请求或分页。首尾单边、仅一篇隐藏、长标题首行对齐、窄窗堆叠、返回参数保留。 |
| 字体授权说明 | PASS | 移除预览区底部分隔线；真实字体加载与下载字节保持。 |
| Agent 外层 | 定向验收 | 顶部复用已认可导航形态，保持深色与 DSH 协调；模型设置是内容页局部主题。全高度 flex/min-h-0、无 Footer、iframe 与恢复逻辑不变。 |
| 错误提示 | 定向验收 | Agent 深色圆角卡片与按钮；Haldur 浅色背景上的轻量圆角卡片，移除外围额外白底，保留根路径缺失安全失败与重新加载逻辑。 |
| 工程 | PASS | Typecheck、production build、git diff --check、Haldur 既有定向验证与 GenUI 安全静态边界。静态合同与真实浏览器结果分别记录。 |

早期浏览器功能回归绑定 207f7c6 / 76ce396。最新 dccad61 仅 Agent/Haldur 外层 className 与 CSS；源代码边界审核和新构建重新验证，未把早期截图当作最新顶栏截图。

## 真实独立完整栈

DSH `dsh-v0.1.1-rc.2`，Commit `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`；GenUI `0.15.1`。只读来源建立独立 Source、执行副本、DSH_HOME、运行与合成资源。官方 Plugin Manager 安装项目已有锁定 tarball，沿用已有兼容性安装器和显式受限预设。未新写 Agent 生命周期框架，既有 `npm run start:host` 负责管理。

端口全部 loopback：Hub 3047、内部 Hub 3048、DSH 3147、Proxy 3148、Gateway 3149。独立 DSH_HOME 持久保存用户在受保护页面自行输入的 Key，测试没有读取或导出 Key。用户明确授权同一 3047 视觉登录配置仅在内存沿用；没有借用其他实例配置。HTTP 本地测试继续使用 OS 临时合成 DATA，遵循已有安全 guard，未放宽生产认证策略。

| 项目 | 结论 | 实际观察 |
|---|---|---|
| DSH_HUB_RUNTIME | PASS | 公共状态 ready / configured；真实 Hub iframe 会话创建、模型输入和响应。 |
| DeepSeek | PASS | DeepSeek-V4-Flash 实际回答 17×23=391。 |
| KNOWLEDGE_MCP | PASS | 实际调用 search_knowledge、search_micro_specs、get_knowledge_asset。读取新合成微规范全文，contentStatus=full、hasContent=true、truncated=false；模型准确回答 19px / 27px、LIME-ORBIT-527 与 Portal 边界，并返回精确 citation.key。 |
| GENUI_HUB_RENDER | PASS，首次发现限制 | 真实模型 genui_create 生成 React，显式 GenUI 受限预设，Hub 内嵌渲染。首次启用插件后需刷新一次才发现客户端渲染器；未伪称首次生成立即可见。 |
| GENUI_SAVE_REFRESH_AUTO_RESTORE | PASS | 将输入从19改为43，保存后完整刷新 Hub，预览自动出现并恢复43，未点击恢复或重新生成。 |
| GENUI_AGENT_STATE_READ | PASS | 后续提示不包含43，实际 genui_state_read 返回 draft / saved-params / __result 的43与marker；模型准确读回并识别与初始19不同。 |

合成微规范 ID：`micro-spec_ed04a3ba186a4642b1ebc378bef53e75`。
GenUI artifact：`s-533fb6e60cc7-v15-synthetic-param-check`；version：`v-6f3bcb71-9096-4775-b48d-7021f09243ce`。
证据：`real-agent-genui-result.json`、`real-mcp-dom.txt`、`real-genui-saved-dom.txt`、`real-genui-auto-restored-dom.txt`、`real-genui-state-tool-dom.txt`。

**保留问题：** 首次启用 GenUI、以及 Supervisor 重启后的首次页面加载，客户端可能先显示工具回执，需要再次刷新才能发现 GenUI renderer。普通完整页面刷新自动恢复已通过，但这不等于冷启动首次渲染已无问题。本轮未为消除该行为而修改官方 Source、Bridge、Proxy、预设或安全机制；合并前应单独确认这一现有初始化行为的最小处理方式。

## 预览、截图与重启

- 本机预览：http://127.0.0.1:3047/agent ；模型设置：http://127.0.0.1:3047/agent/settings 。仅本机，不是部署。
- 首次上传：before-first-upload-1440.png / after-first-upload-1440.png。
- 同一篇文章：before-article-1440.png / after-article-original-1440.png；长标题对齐 article-navigation-aligned-{2560,1440,688}.png。
- 字体：before-font-1440.png / after-font-default-1440.png。
- 设置：before-model-settings-1440.png / after-model-settings-1440.png。
- 真实交互：real-genui-saved.jpg / real-genui-auto-restored.jpg / real-genui-readback.jpg。
- 最新外层样式与异常页截图、视口检查：见最终追加记录。故障夹具明确标注，不作为真实正常栈通过证据。
- 启动说明：`/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/README.md`。普通重启不重装 DSH/GenUI、不重新初始化 DSH_HOME。

## 交付状态

`GIT_PUSHED=false`；`MAIN_MERGED=false`；`WINDOWS_ZIP_BUILT=false`；`PRODUCTION_TOUCHED=false`。

`READY_FOR_VISUAL_REVIEW=YES`。
`READY_FOR_MERGE_CONSIDERATION=NO`：真实交互闭环通过，但首次插件客户端发现/冷启动显示行为仍保留，视觉新增部分仍待用户最终验收。没有获得合并或部署授权。

## 本轮追加视觉修改

- Agent 顶栏与工作台栏保持 `#141414` 暗色，圆角导航与按钮。2560×1080、1440×900、688×900 的实际计算样式均为 rgb(20,20,20)；iframe 分别从 y=121 / 121 / 174 延伸到视口底边，无页面外层滚动，无 Footer，未改变 iframe 内部主题。证据 `agent-final-viewport-checks.json`。
- Haldur 缺根路径使用真实隔离配置故障注入，没有移动或修改根目录文件。页面透明，无额外白色大底板；卡片 #fafafa、8px 圆角与淡边框。三个视口已截图；重新加载仍显示正确安全失败，缺失目录没有被创建。测试后恢复原 host-config.json 和正常根路径。
- 用户最新追加首页主绿：按已提供 `qwen-root-tokens.css` 的 --color-primary=#2ccc6c 替换 Hero、数字、悬停、Canvas 绿色与首页 Footer 强调线。严格文本比对确认三个首页文件仅改色值，动画不变；未改全局 --primary 或其他页面颜色。
- 用户追加 `/search`：复用资产内容页的 Header 与局部主题；移除标题面板强边线，36px 搜索输入与按钮、32px 类型筛选、低分割线结果列表。SearchPage 去除 className 后 AST 与基线相同，搜索参数、服务和链接未变。
- 最终代码提交 `bb798af`；详细完整 Commit、Tree、Build ID 和状态以最终 `source-boundary-audit.json` / `RESULT.json` 为准。报告文档提交不改变已测试代码。

最终追加验收：搜索 Enter 输入“界面检查”得到1项，Skill 类型保留 q 并得到1项，字体类型得到0项且显示清空入口，清空后恢复5项，实际点击 Skill 详情打开正确资源。2560/1440/688截图已保存；688 无横向溢出，8个类型入口都在，Footer 隐藏。首页实际计算标题色为 rgb(44,204,108)，Canvas 与8个模块保留。最终 production build、typecheck、GenUI静态边界、差异格式和受保护工作树指纹检查全部通过。Haldur 正常配置恢复后，8项合成目录/文件再次实际展示。
