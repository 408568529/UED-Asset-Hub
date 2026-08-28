import type { KnowledgeAssetType, KnowledgeAssetView, KnowledgeAssetSource } from "@/types/knowledge";
import type { MarkdownKnowledgeRelatedScope, MarkdownKnowledgeSpecTopic } from "@/types/markdownKnowledge";

export const knowledgeGatewayAssetTypes = ["knowledge", "sop", "component-spec", "micro-spec", "project", "prompt", "skill", "training", "vibe-product", "font"] as const satisfies readonly KnowledgeAssetType[];

export type KnowledgeGatewayAssetType = (typeof knowledgeGatewayAssetTypes)[number];

export interface KnowledgeGatewaySourceDiagnostic {
  source: KnowledgeAssetSource;
  label: string;
  code: "source-unavailable" | "invalid-entry" | "missing-metadata" | "invalid-metadata" | "unsafe-path";
  message: string;
}

export interface KnowledgeGatewayCitation {
  key: string;
  assetType: KnowledgeGatewayAssetType;
  id: string;
  title: string;
  href: string;
  source: KnowledgeAssetSource;
  updatedAt: string;
}

export interface KnowledgeGatewayAsset {
  key: string;
  assetType: KnowledgeGatewayAssetType;
  id: string;
  title: string;
  description: string;
  category?: string;
  tags: string[];
  owner?: string;
  updatedAt: string;
  source: KnowledgeAssetSource;
  section: KnowledgeAssetView["section"];
  microSpec?: { specTopic: MarkdownKnowledgeSpecTopic; specTopicLabel: string; relatedScopes: MarkdownKnowledgeRelatedScope[]; relatedScopeLabels: string[] };
  citation: KnowledgeGatewayCitation;
}

export interface KnowledgeGatewaySearchInput {
  q?: string;
  assetTypes?: KnowledgeGatewayAssetType[];
  sections?: KnowledgeGatewayAsset["section"][];
  categories?: string[];
  tags?: string[];
  limit?: number;
}

export interface KnowledgeGatewayMicroSpecSearchInput {
  q?: string;
  relatedScopes?: MarkdownKnowledgeRelatedScope[];
  specTopics?: MarkdownKnowledgeSpecTopic[];
  tags?: string[];
  limit?: number;
}

export interface KnowledgeGatewaySearchResult {
  status: "ok" | "partial";
  items: Array<KnowledgeGatewayAsset & { relevance: { score: number; matchedFields: string[] } }>;
  diagnostics: KnowledgeGatewaySourceDiagnostic[];
  partial: boolean;
}

export interface KnowledgeGatewayDetailResult {
  asset: KnowledgeGatewayAsset;
  content?: string;
  prompt?: {
    models: string[];
    scenarios: string[];
    outputTypes: string[];
    difficulty: string;
    content: string;
    usageGuide: string;
    exampleInput: string;
    exampleOutput: string;
  };
  skill?: {
    version: string;
    usageScenarios: string[];
    readme: string;
    changeLog: string;
  };
  diagnostics: KnowledgeGatewaySourceDiagnostic[];
  partial: boolean;
}

export class KnowledgeGatewayError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "KnowledgeGatewayError";
  }
}
