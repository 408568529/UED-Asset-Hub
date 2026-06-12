import type { AssetCategory } from "@/types/asset";

export const categoryMeta: Record<AssetCategory, { name: string; description: string; tone: string }> = {
  "vibe-product": {
    name: "Vibe Product",
    description: "团队 AI 产品、原型、Demo 与迭代日志，记录从想法到可用工具的全过程。",
    tone: "AI tools"
  },
  sop: {
    name: "SOP",
    description: "标准流程、设计交付、走查和验收方法，让协作流程被复制和持续优化。",
    tone: "workflow"
  },
  knowledge: {
    name: "知识库",
    description: "设计方法论、业务知识、研究洞察和团队经验，帮助新人快速进入上下文。",
    tone: "learning"
  },
  "component-guideline": {
    name: "组件规范",
    description: "组件交互、状态、布局和验收标准，连接设计系统与真实业务页面。",
    tone: "system"
  },
  "project-retrospective": {
    name: "项目沉淀",
    description: "关键项目的背景、方案、决策和复盘，把过程经验保留下来。",
    tone: "case study"
  },
  "prompt-library": {
    name: "Prompt库",
    description: "可复用的 AI 工作流提示词，覆盖 PRD、竞品分析、设计走查和内容总结。",
    tone: "prompt"
  }
};

export const categories = Object.entries(categoryMeta).map(([id, meta]) => ({
  id: id as AssetCategory,
  ...meta
}));
