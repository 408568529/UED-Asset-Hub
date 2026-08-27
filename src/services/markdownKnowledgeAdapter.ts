import type { KnowledgeAssetView } from "@/types/knowledge";
import { markdownKnowledgeRelatedScopes, markdownKnowledgeSpecTopics, type MarkdownKnowledgeMetadata } from "@/types/markdownKnowledge";

export function adaptMarkdownKnowledge(item: MarkdownKnowledgeMetadata): KnowledgeAssetView {
  const isProject = item.documentType === "project";
  const isMicroSpec = item.documentType === "micro-spec";
  const specTopicLabel = isMicroSpec ? markdownKnowledgeSpecTopics.find((option) => option.value === item.specTopic)?.label : undefined;
  const relatedScopeLabels = isMicroSpec ? item.relatedScopes.map((scope) => markdownKnowledgeRelatedScopes.find((option) => option.value === scope)?.label ?? scope) : undefined;
  return {
    key: `${item.documentType}:${item.id}`,
    id: item.id,
    title: item.title,
    assetType: item.documentType,
    assetTypeLabel: isProject ? "项目沉淀" : isMicroSpec ? "微规范" : "知识文章",
    section: "document",
    businessCategory: item.category || undefined,
    tags: item.tags,
    description: item.description,
    updatedAt: item.updatedAt,
    route: { href: "/knowledge", kind: "internal" },
    owner: item.author,
    specTopic: isMicroSpec ? item.specTopic : undefined,
    specTopicLabel,
    relatedScopes: isMicroSpec ? item.relatedScopes : undefined,
    relatedScopeLabels,
    source: "markdownKnowledgeService"
  };
}
