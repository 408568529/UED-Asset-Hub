import type { OpenModuleId } from "@/types/module";

export const agentModule = {
  name: "悠鼎 Agent",
  description: "团队 AI 工作空间、会话与后续工作流入口。",
  href: "/agent"
};

export const primaryNavigation = [
  { name: "首页", href: "/" },
  agentModule,
  { name: "知识库", href: "/knowledge" },
  { name: "测试环境", href: "/test-environments" }
] as const;

export const openModules: Record<OpenModuleId, { name: string; description: string; href: string; tone: string }> = {
  products: {
    name: "Vibe Product",
    description: "团队自研工具、AI 产品和可复用网页应用。",
    href: "/products",
    tone: "product"
  },
  components: {
    name: "组件规范",
    description: "设计组件的交互规范、Figma 文件和使用说明。",
    href: "/components",
    tone: "system"
  },
  sops: {
    name: "标准 SOP",
    description: "团队标准流程、走查清单和交付协作规范。",
    href: "/sops",
    tone: "workflow"
  },
  skills: {
    name: "Skill Center",
    description: "团队 AI Skill、Prompt Pack、工作流模板和 MCP 配置中心。",
    href: "/skills",
    tone: "skill"
  },
  fonts: {
    name: "Font Library",
    description: "团队字体资源、授权说明、版本和下载入口。",
    href: "/fonts",
    tone: "font"
  },
  prompts: {
    name: "Prompt Library",
    description: "团队 AI Prompt Marketplace，沉淀可复制复用的提示词资产。",
    href: "/prompts",
    tone: "prompt"
  },
  training: {
    name: "培训资料",
    description: "团队培训、设计峰会与行业学习视频资料。",
    href: "/training",
    tone: "training"
  },
  testEnvironments: {
    name: "测试环境",
    description: "按产品与客户版本维护 UAT、测试和演示环境。",
    href: "/test-environments",
    tone: "environment"
  }
};

export const knowledgeModuleHrefs: Record<OpenModuleId, string> = {
  products: "/knowledge?section=product-tool&type=vibe-product",
  components: "/knowledge?section=document&type=component-spec",
  sops: "/knowledge?section=document&type=sop",
  skills: "/knowledge?section=ai&type=skill",
  fonts: "/knowledge?section=resource&type=font",
  prompts: "/knowledge?section=ai&type=prompt",
  training: "/knowledge?section=training",
  testEnvironments: "/test-environments"
};
