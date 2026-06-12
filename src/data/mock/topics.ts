import type { Topic } from "@/types/topic";

export const topics: Topic[] = [
  {
    id: "portal-design-system",
    title: "Portal设计体系",
    description: "围绕 Portal 改版、导航、信息架构和视觉体系的完整沉淀。",
    coverUrl: "https://images.unsplash.com/photo-1559028012-481c04fa702d?auto=format&fit=crop&w=1400&q=80",
    assetIds: ["portal-redesign-retrospective", "portal-ia-playbook", "dashboard-empty-state"],
    tags: ["Portal", "信息架构", "视觉体系"],
    curator: "林予",
    updatedAt: "2026-06-08"
  },
  {
    id: "ai-design-workflow",
    title: "AI设计工作流",
    description: "从需求理解、竞品分析到 PRD 生成的 AI 辅助设计实践。",
    coverUrl: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&w=1400&q=80",
    assetIds: ["ai-competitor-tool", "journey-map-generator", "codex-prd-prompt"],
    tags: ["AI", "工作流", "Prompt"],
    curator: "陈澈",
    updatedAt: "2026-06-06"
  },
  {
    id: "cloud-fund-retrospective",
    title: "云资金项目沉淀",
    description: "账户限制集、资金看板、审批链路等关键业务体验设计复盘。",
    coverUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1400&q=80",
    assetIds: ["cloud-account-limit", "fund-risk-dashboard", "approval-chain-review"],
    tags: ["云资金", "B端", "项目复盘"],
    curator: "林予",
    updatedAt: "2026-06-05"
  },
  {
    id: "component-guideline-system",
    title: "组件规范体系",
    description: "表格、查询、空状态、反馈等组件规范的系统化整理。",
    coverUrl: "https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1400&q=80",
    assetIds: ["table-interaction-guideline", "query-form-guideline", "component-acceptance"],
    tags: ["组件", "交互规范", "Design System"],
    curator: "乔安",
    updatedAt: "2026-06-04"
  },
  {
    id: "prompt-engineering-practice",
    title: "Prompt工程实践",
    description: "沉淀团队已验证的提示词模板和 AI 协作方法。",
    coverUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1400&q=80",
    assetIds: ["codex-prd-prompt", "design-review-prompt", "ai-summary-template"],
    tags: ["Prompt", "Codex", "知识复用"],
    curator: "陈澈",
    updatedAt: "2026-06-02"
  }
];
