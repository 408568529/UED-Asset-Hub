import type { ComponentSpec } from "@/types/componentSpec";
import type { FontAsset } from "@/types/font";
import type { Product } from "@/types/product";
import type { PromptAsset } from "@/types/prompt";
import type { Skill } from "@/types/skill";
import type { Sop } from "@/types/sop";
import type { TrainingVideo } from "@/types/training";
import type { KnowledgeAssetView } from "@/types/knowledge";

function externalRoute(href: string, fallback: string): KnowledgeAssetView["route"] {
  return href.trim()
    ? { href, kind: "external", openInNewTab: true }
    : { href: fallback, kind: "internal" };
}

export function adaptSop(item: Sop): KnowledgeAssetView {
  return {
    key: `sop:${item.id}`,
    id: item.id,
    title: item.name,
    assetType: "sop",
    assetTypeLabel: "SOP",
    section: "document",
    tags: item.tags ?? [],
    description: item.description,
    updatedAt: item.updatedAt,
    route: externalRoute(item.docLink, "/sops"),
    owner: item.owner,
    source: "sopService"
  };
}

export function adaptComponentSpec(item: ComponentSpec): KnowledgeAssetView {
  return {
    key: `component-spec:${item.id}`,
    id: item.id,
    title: item.name,
    assetType: "component-spec",
    assetTypeLabel: "组件规范",
    section: "document",
    tags: item.tags ?? [],
    description: item.description,
    updatedAt: item.updatedAt,
    route: externalRoute(item.docLink, "/components"),
    secondaryRoute: item.figmaLink?.trim() ? { label: "Figma", href: item.figmaLink, kind: "external" } : undefined,
    source: "componentSpecService"
  };
}

export function adaptPrompt(item: PromptAsset): KnowledgeAssetView {
  return {
    key: `prompt:${item.id}`,
    id: item.id,
    title: item.name,
    assetType: "prompt",
    assetTypeLabel: "Prompt",
    section: "ai",
    businessCategory: item.category,
    tags: [...item.tags, ...item.scenarios, ...item.models],
    description: item.summary,
    updatedAt: item.updatedAt,
    route: { href: `/prompts/${item.id}`, kind: "internal" },
    owner: item.author,
    source: "promptService"
  };
}

export function adaptSkill(item: Skill): KnowledgeAssetView {
  return {
    key: `skill:${item.id}`,
    id: item.id,
    title: item.name,
    assetType: "skill",
    assetTypeLabel: "Skill",
    section: "ai",
    businessCategory: item.category,
    tags: [...item.tags, ...item.usageScenarios],
    description: item.description,
    updatedAt: item.updatedAt,
    route: { href: `/skills/${item.id}`, kind: "internal" },
    owner: item.authorName,
    source: "skillService"
  };
}

export function adaptTraining(item: TrainingVideo): KnowledgeAssetView {
  return {
    key: `training:${item.id}`,
    id: item.id,
    title: item.title,
    assetType: "training",
    assetTypeLabel: "培训资料",
    section: "training",
    businessCategory: item.groupName,
    tags: item.tags,
    description: item.description || item.groupName,
    updatedAt: item.updatedAt,
    route: { href: `/training/${item.id}`, kind: "internal" },
    owner: item.speaker || item.uploadedBy,
    source: "trainingService"
  };
}

export function adaptProduct(item: Product): KnowledgeAssetView {
  return {
    key: `vibe-product:${item.id}`,
    id: item.id,
    title: item.name,
    assetType: "vibe-product",
    assetTypeLabel: "Vibe Product",
    section: "product-tool",
    tags: item.tags ?? [],
    description: item.description,
    updatedAt: item.updatedAt,
    route: externalRoute(item.link, "/products"),
    source: "productService"
  };
}

export function adaptFont(item: FontAsset): KnowledgeAssetView {
  return {
    key: `font:${item.id}`,
    id: item.id,
    title: item.name,
    assetType: "font",
    assetTypeLabel: "Font",
    section: "resource",
    businessCategory: item.category,
    tags: item.tags,
    description: item.description,
    updatedAt: item.updatedAt,
    route: { href: `/fonts/${item.id}`, kind: "internal" },
    owner: item.designer,
    source: "fontService"
  };
}
