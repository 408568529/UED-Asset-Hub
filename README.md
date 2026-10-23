# UED Asset Hub V2.5.2

UED Asset Hub 是面向设计团队的资产与知识协作平台，提供知识库、Haldur-Design-Skill 文件工作台、悠鼎 Agent、GenUI 交互成果，以及产品、字体、Prompt、规范、培训和测试环境管理。

## V2.5.2：微规范独立模块

本次版本正式命名为 **UED Asset Hub V2.5.2**，当前开发分支为 `codex/v2.5-competition-delivery`。微规范提供独立顶部入口、主题文件夹管理、独立存储、首次确认初始化及历史数据迁移；保留 Knowledge MCP 检索、全文读取、稳定 ID 和引用兼容性。迁移须显式授权执行，普通启动不会静默迁移或创建丢失的库。

- [版本变更说明](docs/v2.5.2/CHANGELOG.md)
- [开发记录](docs/v2.5.2/DEVELOPMENT.md)
- [实际验收与验证边界](docs/v2.5.2/ACCEPTANCE.md)
- [存储、初始化、迁移及回退操作](docs/micro-standards/STORAGE-AND-MIGRATION.md)

3047 已使用持久化程序和资产目录，日常通过现有 `runtime/02-轻点击我启动.command` 启动。当前版本命名和 Git 备份不触发正式服务器迁移、部署或重新构建 Windows ZIP。下述 V2.3/视觉分支内容保留为历史说明；当前启动方式以本段和 V2.5 文档为准。

## V2.3 视觉分支与演示环境历史

**V2.3** 对应已验收提交 `5065f7ec1f69ac4f35fed8c513410a2bbd182cbf`（Git 标签 `V2.3`），开发分支为 `codex/visual-refresh-v1`。UI Refresh V1.5 已完成真实 Agent / GenUI 回归，V1.6 Windows 隔离候选已由用户确认验收；这些验收不代表已部署到稳定实例。后续访客权限调整在本机 3047 演示环境验证。

| 入口 | 用途 |
| --- | --- |
| `/knowledge` | 统一知识资产列表、搜索筛选、详情和来源返回 |
| `/knowledge?section=training` | 培训资料，视频采用圆角卡片，宽屏三列 |
| `/haldur-design-skill` | Haldur 文件树、文档预览与文件下载 |
| `/agent` | 原生 DSH 工作台、Knowledge MCP 检索与 GenUI 交互 |
| `/agent/settings` | 管理员模型设置，Key 仅在受保护页面输入 |
| `/search` | 全局资产搜索，结果进入知识库对应详情 |
| `/admin/login` | 管理登录 |

新会话默认使用受限的“悠鼎设计与交互助手”，支持 Knowledge MCP 和 GenUI；已有会话保留各自预设。模型可以检索知识、读取全文并引用来源，生成交互面板、保存状态并通过工具读回。输出质量与规范检查结论仍需按实际来源和测试样例核验。

### 访客与管理权限

- Haldur 支持未登录浏览文件树、阅读 Markdown、下载完整 Skill ZIP 和单个文件；上传、编辑、删除及管理接口仍需管理员登录。
- Agent 默认要求登录。仅在明确允许共享会话的环境启用服务端 `AGENT_PUBLIC_ACCESS=true`，才开放访客会话和 GenUI 使用。3047 演示环境已获授权开启，既有会话及成果也对访客可见，不提供用户间会话隔离。
- 访客不展示模型设置标题行；模型 Key、配置接口和运行管理仍受管理员认证保护。开放访客不会解除受限工具、Workspace、GenUI sandbox、预览授权和状态访问边界。
- 凭据、会话、附件、GenUI 成果和运行配置保存在 Git 外；Git 只同步代码及文档。

本机演示入口：[3047 Agent](http://127.0.0.1:3047/agent)。沿用现有环境，不另建运行数据备份或切换到恢复副本。

### 已有 3047 环境重新启动

当前环境通过现有 Host Supervisor 托管 Hub、Gateway、DSH 与 Proxy。端口均为本机回环：公开 Hub `3047`、内部 Hub `3048`、DSH `3147`、Proxy `3148`、Gateway `3149`。

仅在确认该隔离栈已经停止后，使用本机已有启动脚本（可粘贴；这是本机路径，不随 Git 分发）：

```bash
python3 '/Users/zhouzhijun/Documents/UED Asset Hub Visual Refresh/runtime/start-visual-host.py'
```

详细本机配置记录在同目录 `runtime/README.md`。该脚本复用 `npm run start:host` 和已有独立 Runtime，不需要重新初始化 DSH；缺少凭据时由管理员在本环境受保护页面配置，不复制其他实例的 Key。不要在当前服务运行时执行 `build` 覆盖其构建目录。

历史验收与技术说明：

- [V1.4 视觉更新范围](docs/ui-refresh-v1.4-visual-rollout.md)
- [V1.5 功能回归与首次上传修复](docs/ui-refresh-v1.5-final-regression.md)
- [V1.5 GenUI 冷启动收尾验收](docs/ui-refresh-v1.5-genui-cold-start-closeout.md)（取代早期报告中的冷启动未关闭结论）

历史报告保留当时的认证策略与环境状态；当前访客权限以本节和代码配置为准。

## 普通前端开发启动

以下适用于新建开发环境，不用于重启上面的 3047 演示栈。先复制 `.env.example` 为 `.env.local`，设置本环境的管理员凭据及运行目录，再安装依赖并启动：

```bash
npm install
npm run dev
```

`npm run dev` 只启动 Next.js，不会自动准备完整的 DSH / Agent / GenUI 链路。完整运行环境使用下文 Host Supervisor 配置。

Windows 主机从 GitHub 发布、SSH 拉取、构建启动和数据保护的完整操作说明见：[Markdown 说明](docs/Windows主机发布更新流程.md) 或 [可视化操作页](docs/Windows主机发布更新流程.html)。

默认访问：

```bash
http://localhost:3000
```

常用校验：

```bash
npm run typecheck
npm run build
```

## 项目结构

```txt
src/app/                 Next.js App Router 页面
src/components/          页面组件、卡片、搜索、AI 入口和布局
src/config/api.ts        API 与 mock 开关配置
src/config/storage.ts    本地数据目录配置
src/lib/request.ts       未来真实 API 请求封装
src/lib/storage/         本地 JSON 存储抽象
src/types/               Asset、Topic、User、AI 等核心类型
data/                    本地运行数据，已被 Git 忽略
data.example/            新服务器初始化数据模板
src/data/mock/           本地 mock 数据
src/services/            页面唯一依赖的数据服务层
src/agent-integration/  悠鼎 Agent 与 DSH 的适配边界
```

页面不要直接读取本地 JSON 文件。Product、Skill、Font、Prompt、组件规范和标准 SOP 都通过对应 `service` 与 `moduleService` 获取数据。

## V0.1 本地存储

本期不引入数据库，数据默认读取 `DATA_DIR`。目录按「项目本地存储目录 / 模块 / 具体内容」组织：

```txt
data/
├─ meta/
│  ├─ products.json
│  ├─ components.json
│  ├─ sops.json
│  ├─ skills.json
│  ├─ skill-versions.json
│  ├─ fonts.json
│  ├─ font-versions.json
│  ├─ prompts.json
│  ├─ tags.json
│  ├─ test-environments.json
│  ├─ training-groups.json
│  ├─ training-topics.json       # 仅保留旧数据兼容，不再作为页面层级
│  ├─ training-videos.json
│  ├─ training-upload-tasks.json
│  ├─ training-watch-sessions.json
│  ├─ logs.json
│  ├─ uploads.json
│  └─ versions.json
├─ skill-center/
│  └─ Skill 名称/
│     └─ 版本号/
│        └─ skill.zip
├─ font-library/
│  └─ 字体名称/
│     └─ 版本号/
│        └─ 原始字体文件名
├─ prompt-library/
│  └─ .gitkeep
├─ standard-sop/
│  └─ .gitkeep
├─ component-spec/
│  └─ .gitkeep
├─ vibe-product/
│  └─ .gitkeep
├─ training/
│  └─ 资料分组/视频目录/
├─ training-media/
│  └─ 主机预先放置、供“关联本地文件”选择的视频
└─ uploads/
   └─ unclassified/
```

`data/` 是运行时真实数据目录，已经被 `.gitignore` 忽略，不再进入 Git。

部署到公共电脑时，必须把真实数据目录放在代码仓库外，避免 `git pull` 或重新 clone 时影响数据：

```env
DATA_DIR=/UED-Asset-Hub-Storage/data
TRAINING_MEDIA_DIR=/UED-Asset-Hub-Storage/training-media
TEST_ENV_ENCRYPTION_KEY=可选：设置后测试环境密码将以服务端加密方式保存
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
# 仅在通过 HTTPS 访问时设置为 true；内网 HTTP 环境保持 false。
ADMIN_SESSION_SECURE=false
```

Windows 主机示例：

```env
DATA_DIR=D:/UED-Asset-Hub/data
TRAINING_MEDIA_DIR=D:/UED-Asset-Hub/training-media
TEST_ENV_ENCRYPTION_KEY=可选：设置主机专用随机密钥以启用测试密码加密
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
```

首次部署空主机时，可以用 `data.example/` 初始化真实数据目录：

```bash
mkdir -p /UED-Asset-Hub-Storage/data
cp -R data.example/* /UED-Asset-Hub-Storage/data/
```

Windows PowerShell 示例：

```powershell
New-Item -ItemType Directory -Force D:\UED-Asset-Hub\data
Copy-Item -Recurse .\data.example\* D:\UED-Asset-Hub\data\
```

首页模块数量来自本地数据实时统计：

- `Vibe Product` 数量读取 `meta/products.json`
- `组件规范` 数量读取 `meta/components.json`
- `标准 SOP` 数量读取 `meta/sops.json`
- `Skill Center` 数量读取 `meta/skills.json`
- `Font Library` 数量读取 `meta/fonts.json`
- `Prompt Library` 数量读取 `meta/prompts.json`
- `培训资料` 数量读取 `meta/training-videos.json`
- `测试环境` 数量读取 `meta/test-environments.json`

代码更新和内容数据建议分开管理：代码通过 Git 同步，真实内容保存在公共电脑的 `DATA_DIR` 中。

## 悠鼎 Agent P0 基础运行

悠鼎 Agent 使用官方 DeepSeek Harness 源码固定在 `0.1.1-rc.2 / b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`。DSH 可位于项目外或精确的 `vendor/deepseek-harness`；后者必须保持独立 `.git`，并由 `/vendor/deepseek-harness/` 忽略，官方源码不进入 Asset Hub Git 历史也不做修改。DSH 仅监听服务器本机 `127.0.0.1:3080`，Asset Hub 通过服务端 Adapter 检查运行状态，浏览器不会直接访问 DSH。

在主机 `.env.local` 中额外设置仓库外的运行目录：

```env
AGENT_RUNTIME_DIR=D:/UED-Asset-Hub/agent-data
AGENT_ENABLED=true
DSH_SOURCE_DIR=D:/UED-Asset-Hub-Host/UED-Asset-Hub/vendor/deepseek-harness
DSH_BASE_URL=http://127.0.0.1:3080
AGENT_PROXY_PORT=3081
AGENT_PROXY_HOST=127.0.0.1
HOST_BIND_HOST=0.0.0.0
HOST_PORT=3027
HOST_INTERNAL_PORT=3028
AGENT_GATEWAY_TOKEN=<long-random-server-only-token>
KNOWLEDGE_GATEWAY_MCP_PORT=3082
```

首次部署可在精确 vendor 目录准备固定版本的 DSH 源码（Windows PowerShell）。已有 Repository 的 Source Relocation 必须整体移动，不得用此脚本重新 clone：

```powershell
.\agent-integration\scripts\setup-dsh.ps1 -DshSourceDir "D:\UED-Asset-Hub-Host\UED-Asset-Hub\vendor\deepseek-harness"
```

DSH 和 Agent Proxy 都只监听主机本机回环地址（分别为 `127.0.0.1:3080`、`127.0.0.1:3081`）。从 V2.1.0.1 起应仅使用 Host Runner 启动完整的 `Asset Hub -> Gateway MCP -> DSH -> Proxy` 链路；独立的 `start-dsh.ps1` 只保留诊断用途，且必须已提供本机 MCP URL。正式运行时 Host Runner 将 `/agent-runtime` 同源转发到 Proxy，默认验证 Asset Hub 管理员会话后才转发官方 DSH Web UI、HTTP 请求和 WebSocket 事件流；显式启用 `AGENT_PUBLIC_ACCESS=true` 时，仅对允许的访客路由开放转发，管理与凭据接口继续鉴权；浏览器不会直接访问 DSH 或 Proxy。`/agent` 会自动嵌入该官方工作台，保留 DSH 的字体、布局、控件、动效与交互，只将品牌强调色映射为 Asset Hub 绿色。

通过 Host Supervisor 启动完整链路后访问 `/agent`；默认需管理员登录，已启用共享访客模式时可直接使用。运行状态检查：

```bash
npm run verify:agent-runtime
```

`agent-data` 与 `DATA_DIR` 必须是互不包含的真实目录：前者保存 DSH Session、附件、Workspace 与后续 Artifact，后者仅保存正式资产数据。Host Runner 通过 `realpath` 再次校验；`KNOWLEDGE_DIR` 固定为 `DATA_DIR/knowledge`，不允许落入 Agent Runtime。两者均在 Git 仓库外，执行 `git pull` 更新代码不会覆盖。

V2.1.0.1 的 Knowledge Gateway 仅通过本机 MCP Bridge 向 DSH 暴露 `search_knowledge`、`search_micro_specs`、`get_knowledge_asset` 三个只读工具。Gateway token 只交给 Asset Hub 与 Bridge；DSH、Agent Proxy 和浏览器均不接收。公开端口拒绝 `/api/knowledge-gateway/*`，Bridge 从 `127.0.0.1:3028` 的内部 Asset Hub 调用鉴权 API。

## Windows 主机正式运行

正式部署不要分别手动启动 DSH、Agent Proxy 和 Asset Hub。执行一次生产构建后，使用 Host Runner 统一托管：

```powershell
npm run start:host
```

`npm run start:host` 启动唯一的 Host Supervisor。它先提供 Public Edge 与 Asset Hub Internal，再以同一个 Runtime Lifecycle Core 管理 `Gateway MCP -> DSH Runtime -> Agent Proxy`；因此 DSH Source、Build 或 Credential 不满足时，Asset Hub Shell 仍可保持可访问。启动前会检查仓库外且互不包含的 `DATA_DIR`、`AGENT_RUNTIME_DIR`、固定 DSH 提交、生产构建和五个端口；`DSH_SOURCE_DIR` 位于项目内时仅允许精确的 `vendor/deepseek-harness` 独立 Git Repository。DSH 使用 Gateway-only Profile：保留会话、受 Proxy 限制的 Workspace 选择与 MCP，不加载通用 Bash、文件系统、文件搜索和编辑器工具。正式用户只需访问 `http://主机IP:3027`。

生产 Windows 主机应使用独立的非管理员服务账号运行 Host Supervisor。开发环境可以由 `.env.local` 提供 Host Config；正式环境优先由 NSSM 或 Windows Service 注入 ACL 受控的环境变量。两种方式都进入同一个 Node Supervisor，且 Host Config 不得包含 DeepSeek Credential。服务账号需要访问生产构建、DSH Source、`DATA_DIR` 与 `AGENT_RUNTIME_DIR`；安全边界由子进程最小环境白名单、Source Validator、Restricted Preset 和 Gateway-only MCP 共同保证，不依赖 DSH cwd。

Windows 可使用任务计划程序创建开机或登录后自动启动任务：

```powershell
.\scripts\install-host-runner-task.ps1
```

默认在用户登录后启动；需要开机启动时使用：

```powershell
.\scripts\install-host-runner-task.ps1 -AtStartup
```

也可以使用 NSSM 将 `scripts\启动 UED Asset Hub Host Runner.bat` 注册为服务。无论使用何种方式，DSH 仍只监听 `127.0.0.1:3080`，真实资产和 Agent 运行数据均位于 Git 外。

NSSM 示例：

```powershell
nssm install "UED Asset Hub Host Runner" "C:\Windows\System32\cmd.exe" "/c \"D:\UED-Asset-Hub-Host\UED-Asset-Hub\scripts\启动 UED Asset Hub Host Runner.bat\""
nssm start "UED Asset Hub Host Runner"
```
为方便迁移，上传文件路径保存为相对 `DATA_DIR` 的路径，例如 `skill-center/xxx/v1.0.0/skill.zip`。

培训视频常规上传保存在 `DATA_DIR/training/`。服务器本地关联只扫描 `TRAINING_MEDIA_DIR`，不会浏览主机其他目录。测试环境密码在配置 `TEST_ENV_ENCRYPTION_KEY` 时使用服务端加密；未配置时按内部普通文本保存。密钥不能提交到 Git；更换或移除密钥前必须完成已加密密码的数据迁移，否则旧密码无法解密。

## V1.8 功能

- Skill 作者与实际上传人分离，旧 `username` / `author` 字段自动兼容。
- 搜索页实时聚合所有模块 Service，不再读取独立 mock 搜索结果。
- 所有资产标签和使用场景统一通过 Tag Service 选择、新建与去重。
- Prompt 列表支持原位预览、复制统计和操作日志。
- 测试环境支持行内新增与编辑，密码默认隐藏并按需解密。
- 培训资料首页按一级资料分组展示文件夹；旧主题自动并入标签，历史视频不会消失。
- 培训资料支持浏览器真实上传进度、失败重试、服务器媒体目录关联、Range 播放和基础观看统计；有效播放超过 5 秒后立即刷新次数，同一会话只计一次。

推荐服务器目录：

```txt
/UED-Asset-Hub-App/          # Git clone 的代码目录
/UED-Asset-Hub-Storage/data/ # 真实业务数据目录，不进 Git
```

后续只更新平台代码时，在代码目录执行：

```bash
cd /UED-Asset-Hub-App
git pull
npm install
npm run build
```

`npm run start` 会先检查 `DATA_DIR` 和 `TRAINING_MEDIA_DIR`：它们必须显式配置且位于 Git 代码目录之外。检查不通过时服务不会启动，避免误把新上传数据写进会被 Git 更新的目录。

只要 `.env.local` 中的 `DATA_DIR` 指向仓库外的 `/UED-Asset-Hub-Storage/data` 或 `D:/UED-Asset-Hub/runtime-data`，代码更新不会覆盖服务器上的真实数据。也可以在更新前单独运行：

```bash
npm run verify:runtime-data
```

更新代码前建议先备份真实数据：

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
Compress-Archive -Path "D:\UED-Asset-Hub\data" -DestinationPath "D:\UED-Asset-Hub\data-backup-$ts.zip"
```

通用上传接口会按模块保存文件：

- `assetModule=product` → `vibe-product/资产名称/文件名`
- `assetModule=component` → `component-spec/资产名称/文件名`
- `assetModule=sop` → `standard-sop/资产名称/文件名`
- `assetModule=skill` → `skill-center/资产名称/文件名`
- `assetModule=font` → `font-library/资产名称/文件名`
- `assetModule=prompt` → `prompt-library/资产名称/文件名`
- 未选择模块 → `uploads/unclassified/文件名`

## V1.2 管理流程

管理入口统一走 `/admin/login`：

```txt
管理入口
↓
账号密码登录
↓
/admin 管理列表
↓
新建 / 编辑 / 删除 Product 或组件规范
```

`ADMIN_USERNAME` 是可选项：缺失或仅含空白时，共享 Host Security Validator 统一使用 `admin`。`ADMIN_PASSWORD` 与 `ADMIN_SESSION_SECRET` 仍必须由主机显式配置。

登录成功后由服务端写入 `HttpOnly` 会话 Cookie；账号密码不会写入浏览器 `localStorage`，也不会作为请求头发送。部署时可选配置 `ADMIN_USERNAME`，并必须配置非默认 `ADMIN_PASSWORD` 和至少 32 UTF-8 字节且独立的 `ADMIN_SESSION_SECRET`。只有后两者缺失或不安全时，`npm run dev`、`npm start` 与 `npm run start:host` 才会在启动前触发 Fatal Host Security Gate；`npm run build` 不读取这些运行时凭据。`/publish` 不再作为普通发布入口，会导向管理登录流程。

## V1.3 日志与版本记录

管理端新增：

- `/admin/logs` 更新日志
- `/admin/uploads` 上传记录，当前暂无真实上传能力，默认展示空数据
- `/admin/versions` 版本记录，按 Vibe Product / 组件规范分组展示
- `/admin/assets/[id]/versions/[versionId]` 版本详情
- `/admin/settings` 系统设置占位

新增、编辑、删除资产会写入操作日志。编辑资产时会生成版本快照，快照内容先保存完整 JSON 字符串。日志或版本写入失败不会阻断主操作，但接口会返回 warning，前端会提示用户。

## 从 Mock 切换到真实 API

1. 复制环境变量：

```bash
cp .env.example .env.local
```

2. 设置：

```env
NEXT_PUBLIC_USE_MOCK=false
NEXT_PUBLIC_API_BASE_URL=https://your-api.example.com
```

3. 在 `src/services/*Service.ts` 中替换或扩展真实接口路径。页面层无需调整。

当前预留接口方向：

- `GET /api/stats`
- `GET /api/products`
- `POST /api/products`
- `PUT /api/products/:id`
- `DELETE /api/products/:id`
- `GET /api/components`
- `POST /api/components`
- `PUT /api/components/:id`
- `DELETE /api/components/:id`
- `GET /api/fonts`
- `POST /api/fonts`
- `PUT /api/fonts/:id`
- `DELETE /api/fonts/:id`
- `GET /api/fonts/:id/versions`
- `POST /api/fonts/:id/versions`
- `GET /api/fonts/:id/download`
- `GET /api/prompts`
- `POST /api/prompts`
- `PUT /api/prompts/:id`
- `DELETE /api/prompts/:id`
- `POST /api/prompts/:id/copy`
- `GET /api/logs`
- `POST /api/logs`
- `GET /api/uploads`
- `GET /api/versions`
- `GET /api/versions/:id`
- `GET /api/assets`
- `GET /api/assets/featured`
- `GET /api/assets/:id`
- `GET /api/assets/:id/related`
- `GET /api/topics`
- `GET /api/topics/:id`
- `GET /api/topics/:id/assets`

## 后期接入服务器后端

推荐保持当前分层：

```txt
UI 页面
↓
Service 数据层
↓
request API 请求层
↓
Node.js / Supabase / 自建后端
↓
PostgreSQL / OSS / S3 / 向量数据库
```

可逐步接入：

- 登录与用户体系
- 内容发布、编辑、审核
- 权限管理
- 收藏、评论、浏览量
- 文件上传与 OSS/S3 存储
- PostgreSQL 或 Supabase
- 资产全文检索与向量检索

## 预留 AI Service 接口

此处是旧版摘要、标签等页面辅助能力的接口预留，不代表当前 Agent 仅为 mock。悠鼎 Agent 的真实模型、Knowledge MCP 与 GenUI 使用前述 DSH / Host Supervisor 链路，模型 Key 由管理员通过 `/agent/settings` 管理。

这些预留 AI 能力集中在 `src/services/aiService.ts`，配置在 `src/config/api.ts` 和 `.env.local`。

预留环境变量：

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_MODEL=
```

后续建议通过 Next.js Route Handler 在服务端调用模型，避免在浏览器暴露 Key。可接入 OpenAI、Claude、Gemini、DeepSeek 或自定义 Base URL。

当前 mock 方法：

- `generateSummary(assetId: string)`
- `askUED(question: string)`
- `generateTags(content: string)`

## 已实现页面

知识内容以 `/knowledge` 为统一入口；`/skills`、`/fonts`、`/prompts`、`/components`、`/sops` 和培训列表等旧入口重定向到对应知识库页面。下列地址同时保留管理及兼容路由。

- `/knowledge` 知识库
- `/haldur-design-skill` Haldur 文件工作台
- `/agent` 悠鼎 Agent 与 GenUI 工作台
- `/agent/settings` 管理员模型设置
- `/` 首页
- `/products` Vibe Product
- `/skills` Skill Center
- `/fonts` Font Library
- `/fonts/[id]` 字体详情
- `/prompts` Prompt Library
- `/prompts/[id]` Prompt 详情
- `/components` 组件规范
- `/sops` 标准 SOP
- `/admin/login` 管理登录
- `/admin` 管理列表
- `/admin/products/new` 新建 Product
- `/admin/products/[id]` 编辑 Product
- `/admin/components/new` 新建组件规范
- `/admin/components/[id]` 编辑组件规范
- `/admin/skills/new` 新建 Skill
- `/admin/skills/[id]` 编辑 Skill
- `/admin/skills/[id]/versions/new` 上传 Skill 新版本
- `/admin/fonts/new` 新建字体
- `/admin/fonts/[id]` 编辑字体 / 上传字体新版本
- `/admin/prompts/new` 新建 Prompt
- `/admin/prompts/[id]` 编辑 Prompt
- `/admin/sops/new` 新建 SOP
- `/admin/sops/[id]` 编辑 SOP
- `/admin/logs` 更新日志
- `/admin/uploads` 上传记录
- `/admin/uploads/new` 上传文件
- `/admin/versions` 版本记录
- `/admin/assets/[id]/versions/[versionId]` 版本详情
- `/admin/settings` 系统设置
- `/category/[category]` 分类页
- `/topics` 专题集合
- `/topics/[id]` 专题详情
- `/assets/[id]` 内容详情
- `/search` 搜索页
- `/publish` 导向管理登录
- `/me` 用户中心
- `/console` 旧版轻量管理入口
