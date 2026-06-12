import { aiProviderConfig } from "@/config/api";
import type { AIAnswer } from "@/types/ai";

export const aiService = {
  providerConfig: aiProviderConfig,

  async generateSummary(assetId: string): Promise<string> {
    // TODO: Replace with server-side AI route. Support OpenAI, Claude, Gemini, DeepSeek or a custom base URL.
    return `AI 已为 ${assetId} 生成摘要：这份资产适合在新项目启动、方案评审和知识复用时引用。`;
  },

  async askUED(question: string): Promise<AIAnswer> {
    // TODO: Route question to RAG service after assets are indexed in a database/vector store.
    return {
      id: `ai-${Date.now()}`,
      question,
      answer: "Ask UED 当前使用 mock 回答：建议先查看 Portal设计体系、组件规范体系和 Prompt工程实践三个专题，它们覆盖了大多数团队复用场景。",
      relatedAssetIds: ["portal-redesign-retrospective", "table-interaction-guideline", "codex-prd-prompt"],
      createdAt: new Date().toISOString()
    };
  },

  async generateTags(content: string): Promise<string[]> {
    // TODO: Use AI provider to extract tags from submitted content before publish.
    if (content.includes("组件")) return ["组件规范", "Design System", "验收"];
    if (content.includes("Prompt") || content.includes("AI")) return ["AI", "Prompt", "知识复用"];
    return ["项目沉淀", "设计经验", "团队资产"];
  }
};
