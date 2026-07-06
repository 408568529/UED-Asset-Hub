# UED Asset Hub

UED Asset Hub 是面向设计团队的内容型资产社区 MVP。V0.1 前台开放 Vibe Product 和组件规范，专题、知识库、Prompt 等能力先保留页面和扩展结构，不放入口。

## 启动

```bash
npm install
npm run dev
```

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
src/config/storage.ts    本地数据目录和管理员密码配置
src/lib/request.ts       未来真实 API 请求封装
src/lib/storage/         本地 JSON 存储抽象
src/types/               Asset、Topic、User、AI 等核心类型
data/                    V0.1 本地 JSON 数据
src/data/mock/           本地 mock 数据
src/services/            页面唯一依赖的数据服务层
```

页面不要直接读取本地 JSON 文件。V0.1 的 Product 和组件规范通过 `productService`、`componentSpecService`、`moduleService` 获取数据。

## V0.1 本地存储

本期不引入数据库，数据默认读取项目内 `data/`：

```txt
data/products.json
data/components.json
data/sops.json
data/skills.json
data/skill-versions.json
data/logs.json
data/uploads.json
data/versions.json
```

部署到公共电脑时，建议在 `.env.local` 配置固定目录：

```env
DATA_DIR=/UED-Asset-Hub/data
NEXT_PUBLIC_ADMIN_USERNAME=admin
NEXT_PUBLIC_ADMIN_PASSWORD=admin123
```

首页模块数量来自本地数据实时统计：

- `Vibe Product` 数量读取 `products.json`
- `组件规范` 数量读取 `components.json`
- `标准 SOP` 数量读取 `sops.json`
- `Skill Center` 数量读取 `skills.json`

代码更新和内容数据建议分开管理：代码通过 Git 同步，真实内容保存在公共电脑的 `DATA_DIR` 中。

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

第一期默认账号密码：

```txt
admin / admin123
```

登录态暂存在浏览器 `localStorage`：

```txt
ued_admin_token=mock-token
```

后续接入真实后端时，可将 `src/lib/adminSession.ts` 替换为真实 token/session 逻辑。`/publish` 不再作为普通发布入口，会导向管理登录流程。

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

## 后期接入 AI API

AI 能力集中在 `src/services/aiService.ts`，配置在 `src/config/api.ts` 和 `.env.local`。

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

- `/` 首页
- `/products` Vibe Product
- `/skills` Skill Center
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
