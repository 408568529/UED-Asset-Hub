export const knowledgeSections = ["document", "ai", "training", "product-tool", "resource"] as const;
export const knowledgeAssetTypes = ["knowledge", "sop", "component-spec", "project", "prompt", "skill", "training", "vibe-product", "font"] as const;
export const knowledgeSorts = ["updated-desc", "title-asc", "title-desc"] as const;

export type KnowledgeSection = (typeof knowledgeSections)[number];
export type KnowledgeAssetType = (typeof knowledgeAssetTypes)[number];
export type KnowledgeSort = (typeof knowledgeSorts)[number];
export type KnowledgeAssetSource = "sopService" | "componentSpecService" | "promptService" | "skillService" | "trainingService" | "productService" | "fontService";

export interface KnowledgeAssetView {
  key: `${KnowledgeAssetType}:${string}`;
  id: string;
  title: string;
  assetType: KnowledgeAssetType;
  assetTypeLabel: string;
  section: KnowledgeSection;
  businessCategory?: string;
  tags: string[];
  description: string;
  updatedAt: string;
  route: {
    href: string;
    kind: "internal" | "external";
    openInNewTab?: boolean;
  };
  secondaryRoute?: {
    label: string;
    href: string;
    kind: "internal" | "external";
  };
  owner?: string;
  source: KnowledgeAssetSource;
}

export interface KnowledgeSourceState {
  source: KnowledgeAssetSource;
  label: string;
  status: "fulfilled" | "rejected";
}

export interface KnowledgeLibraryQuery {
  section?: "all" | KnowledgeSection;
  type?: KnowledgeAssetType;
  asset?: `${KnowledgeAssetType}:${string}`;
  category?: string;
  tag?: string;
  q?: string;
  sort?: KnowledgeSort;
}

export interface KnowledgeLibraryResult {
  items: KnowledgeAssetView[];
  totalLoaded: number;
  sourceStates: KnowledgeSourceState[];
  categories: string[];
  tags: string[];
}
