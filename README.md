# UED Asset Hub

UED Asset Hub 是面向设计团队的内容型资产社区 MVP。它不是后台管理系统，而是用卡片流、专题、阅读页、搜索和 AI Ask 入口组织团队资产。

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
src/lib/request.ts       未来真实 API 请求封装
src/types/               Asset、Topic、User、AI 等核心类型
src/data/mock/           本地 mock 数据
src/services/            页面唯一依赖的数据服务层
```

页面不要直接引用 `src/data/mock/*`。当前页面通过 `assetService`、`topicService`、`searchService`、`aiService` 获取数据。

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
- `/category/[category]` 分类页
- `/topics` 专题集合
- `/topics/[id]` 专题详情
- `/assets/[id]` 内容详情
- `/search` 搜索页
- `/publish` 发布页占位
- `/me` 用户中心
- `/console` 轻量管理入口
