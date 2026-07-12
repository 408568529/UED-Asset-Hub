import type { OpenModuleId } from "@/types/module";

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
