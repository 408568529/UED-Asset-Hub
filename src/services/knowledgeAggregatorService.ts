import { adaptComponentSpec, adaptFont, adaptProduct, adaptPrompt, adaptSkill, adaptSop, adaptTraining } from "@/services/knowledgeAdapters";
import { componentSpecService } from "@/services/componentSpecService";
import { fontService } from "@/services/fontService";
import { adaptMarkdownKnowledge } from "@/services/markdownKnowledgeAdapter";
import { markdownKnowledgeService } from "@/services/markdownKnowledgeService";
import { productService } from "@/services/productService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";
import { trainingService } from "@/services/trainingService";
import type { KnowledgeAssetSource, KnowledgeAssetView, KnowledgeLibraryQuery, KnowledgeLibraryResult, KnowledgeSort, KnowledgeSourceState } from "@/types/knowledge";

type KnowledgeSource = {
  source: KnowledgeAssetSource;
  label: string;
  load: () => Promise<KnowledgeAssetView[]>;
};

const knowledgeSources: KnowledgeSource[] = [
  { source: "markdownKnowledgeService", label: "Markdown Knowledge", load: async () => (await markdownKnowledgeService.list()).documents.map(adaptMarkdownKnowledge) },
  { source: "sopService", label: "SOP", load: async () => (await sopService.getSopsForKnowledge()).map(adaptSop) },
  { source: "componentSpecService", label: "组件规范", load: async () => (await componentSpecService.getComponentsForKnowledge()).map(adaptComponentSpec) },
  { source: "promptService", label: "Prompt", load: async () => (await promptService.getPromptsForKnowledge()).map(adaptPrompt) },
  { source: "skillService", label: "Skill", load: async () => (await skillService.getSkillsForKnowledge()).map(adaptSkill) },
  { source: "trainingService", label: "培训资料", load: async () => (await trainingService.getVideosForKnowledge()).map(adaptTraining) },
  { source: "productService", label: "Vibe Product", load: async () => (await productService.getProductsForKnowledge()).map(adaptProduct) },
  { source: "fontService", label: "Font", load: async () => (await fontService.getFontsForKnowledge()).map(adaptFont) }
];

function normalize(value: string | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function unique(values: string[]) {
  return [...new Map(values.filter(Boolean).map((value) => [normalize(value), value.trim()])).values()].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function matchesQuery(item: KnowledgeAssetView, query: KnowledgeLibraryQuery) {
  if (query.section && query.section !== "all" && item.section !== query.section) return false;
  if (query.type && item.assetType !== query.type) return false;
  if (query.category && item.businessCategory !== query.category) return false;
  if (query.tag && !item.tags.some((tag) => normalize(tag) === normalize(query.tag))) return false;

  const keyword = normalize(query.q);
  if (!keyword) return true;

  return [item.title, item.description, item.assetTypeLabel, item.businessCategory ?? "", item.owner ?? "", item.specTopic ?? "", item.specTopicLabel ?? "", ...(item.relatedScopes ?? []), ...(item.relatedScopeLabels ?? []), ...item.tags]
    .join(" ")
    .toLocaleLowerCase()
    .includes(keyword);
}

function sortItems(items: KnowledgeAssetView[], sort: KnowledgeSort = "updated-desc") {
  return [...items].sort((a, b) => {
    if (sort === "title-asc") return a.title.localeCompare(b.title, "zh-CN");
    if (sort === "title-desc") return b.title.localeCompare(a.title, "zh-CN");
    return +new Date(b.updatedAt) - +new Date(a.updatedAt) || a.title.localeCompare(b.title, "zh-CN");
  });
}

export const knowledgeAggregatorService = {
  async getLibrary(query: KnowledgeLibraryQuery = {}): Promise<KnowledgeLibraryResult> {
    const settled = await Promise.allSettled(knowledgeSources.map((source) => source.load()));
    const sourceStates: KnowledgeSourceState[] = settled.map((result, index) => ({
      source: knowledgeSources[index].source,
      label: knowledgeSources[index].label,
      status: result.status
    }));
    const loadedItems = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const scopedItems = loadedItems.filter((item) => {
      if (query.section && query.section !== "all" && item.section !== query.section) return false;
      return !query.type || item.assetType === query.type;
    });

    return {
      items: sortItems(loadedItems.filter((item) => matchesQuery(item, query)), query.sort),
      totalLoaded: loadedItems.length,
      sourceStates,
      categories: unique(scopedItems.map((item) => item.businessCategory ?? "")),
      tags: unique(scopedItems.flatMap((item) => item.tags))
    };
  }
};
