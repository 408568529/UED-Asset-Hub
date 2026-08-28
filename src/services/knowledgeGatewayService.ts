import { knowledgeAggregatorService } from "@/services/knowledgeAggregatorService";
import { markdownKnowledgeService } from "@/services/markdownKnowledgeService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import type { KnowledgeAssetView } from "@/types/knowledge";
import { markdownKnowledgeRelatedScopes, markdownKnowledgeSpecTopics, type MarkdownKnowledgeRelatedScope, type MarkdownKnowledgeSpecTopic } from "@/types/markdownKnowledge";
import { KnowledgeGatewayError, type KnowledgeGatewayAsset, type KnowledgeGatewayAssetType, type KnowledgeGatewayDetailResult, type KnowledgeGatewayMicroSpecSearchInput, type KnowledgeGatewaySearchInput, type KnowledgeGatewaySearchResult, type KnowledgeGatewaySourceDiagnostic } from "@/types/knowledgeGateway";

const maximumLimit = 20;

function normalize(value: string | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function words(value: string | undefined) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function citationFor(item: KnowledgeAssetView): KnowledgeGatewayAsset["citation"] {
  return {
    key: `asset-hub://knowledge/${item.assetType}/${item.id}`,
    assetType: item.assetType,
    id: item.id,
    title: item.title,
    href: `/knowledge?asset=${encodeURIComponent(item.key)}`,
    source: item.source,
    updatedAt: item.updatedAt
  };
}

function toGatewayAsset(item: KnowledgeAssetView): KnowledgeGatewayAsset {
  return {
    key: item.key,
    assetType: item.assetType,
    id: item.id,
    title: item.title,
    description: item.description,
    category: item.businessCategory,
    tags: item.tags,
    owner: item.owner,
    updatedAt: item.updatedAt,
    source: item.source,
    section: item.section,
    microSpec: item.specTopic && item.relatedScopes ? { specTopic: item.specTopic as MarkdownKnowledgeSpecTopic, specTopicLabel: item.specTopicLabel ?? item.specTopic, relatedScopes: item.relatedScopes as MarkdownKnowledgeRelatedScope[], relatedScopeLabels: item.relatedScopeLabels ?? item.relatedScopes } : undefined,
    citation: citationFor(item)
  };
}

function assertLimit(limit: number | undefined) {
  if (limit === undefined) return 5;
  if (!Number.isInteger(limit) || limit < 1 || limit > maximumLimit) {
    throw new KnowledgeGatewayError("invalid-limit", 400, `limit 必须是 1 到 ${maximumLimit} 的整数。`);
  }
  return limit;
}

function matchAll(values: string[], expected: string[] | undefined) {
  if (!expected?.length) return true;
  const normalized = new Set(values.map(normalize));
  return expected.every((value) => normalized.has(normalize(value)));
}

function rank(item: KnowledgeGatewayAsset, query: string | undefined, content = "") {
  const tokens = words(query);
  const matchedFields = new Set<string>();
  let score = 0;
  for (const token of tokens) {
    const title = normalize(item.title);
    const tags = item.tags.map(normalize);
    const description = normalize(item.description);
    const body = normalize(content);
    if (title === token) { score += 700; matchedFields.add("title-exact"); }
    else if (title.startsWith(token)) { score += 650; matchedFields.add("title-prefix"); }
    else if (title.includes(token)) { score += 600; matchedFields.add("title"); }
    if (tags.some((tag) => tag === token)) { score += 500; matchedFields.add("tags"); }
    if (description.includes(token)) { score += 300; matchedFields.add("description"); }
    if (body.includes(token)) { score += 200; matchedFields.add("content"); }
  }
  return { score, matchedFields: [...matchedFields] };
}

async function loadLibrary() {
  const [library, markdown] = await Promise.all([knowledgeAggregatorService.getLibrary(), markdownKnowledgeService.list()]);
  const diagnostics: KnowledgeGatewaySourceDiagnostic[] = [
    ...library.sourceStates.filter((state) => state.status === "rejected").map((state) => ({
      source: state.source,
      label: state.label,
      code: "source-unavailable" as const,
      message: "该知识来源暂时不可读取。"
    })),
    ...markdown.diagnostics.map((diagnostic) => ({
      source: "markdownKnowledgeService" as const,
      label: "Markdown Knowledge",
      code: diagnostic.code,
      message: diagnostic.message
    }))
  ];
  if (diagnostics.filter((item) => item.code === "source-unavailable").length === library.sourceStates.length) throw new KnowledgeGatewayError("all-sources-unavailable", 503, "Knowledge Gateway sources are temporarily unavailable.");
  return { items: library.items.map(toGatewayAsset), diagnostics };
}

function sortScored<T extends KnowledgeGatewayAsset & { score: number }>(items: T[]) {
  return items.sort((a, b) => b.score - a.score || +new Date(b.updatedAt) - +new Date(a.updatedAt) || a.title.localeCompare(b.title, "zh-CN"));
}

function ensureAssetType(value: string): KnowledgeGatewayAssetType {
  const accepted: KnowledgeGatewayAssetType[] = ["knowledge", "sop", "component-spec", "micro-spec", "project", "prompt", "skill", "training", "vibe-product", "font"];
  if (!accepted.includes(value as KnowledgeGatewayAssetType)) throw new KnowledgeGatewayError("invalid-asset-type", 400, "assetType 不受 Knowledge Gateway 支持。");
  return value as KnowledgeGatewayAssetType;
}

async function contentFor(item: KnowledgeGatewayAsset) {
  if (["knowledge", "project", "micro-spec"].includes(item.assetType)) return (await markdownKnowledgeService.readContent(item.id)) ?? "";
  if (item.assetType === "prompt") return (await promptService.getPromptForKnowledgeById(item.id))?.content ?? "";
  return "";
}

export const knowledgeGatewayService = {
  async search(input: KnowledgeGatewaySearchInput = {}): Promise<KnowledgeGatewaySearchResult> {
    const limit = assertLimit(input.limit);
    const { items, diagnostics } = await loadLibrary();
    for (const assetType of input.assetTypes ?? []) ensureAssetType(assetType);
    const filtered = items.filter((item) => (!input.assetTypes?.length || input.assetTypes.includes(item.assetType)) && (!input.sections?.length || input.sections.includes(item.section)) && (!input.categories?.length || input.categories.some((category) => normalize(category) === normalize(item.category))) && matchAll(item.tags, input.tags));
    const scored = await Promise.all(filtered.map(async (item) => {
      const ranked = rank(item, input.q);
      return { ...item, relevance: ranked, score: ranked.score };
    }));
    const matched = words(input.q).length ? scored.filter((item) => item.score > 0) : scored;
    return { status: diagnostics.length ? "partial" : "ok", items: sortScored(matched).slice(0, limit).map(({ score: _score, ...item }) => item), diagnostics, partial: diagnostics.length > 0 };
  },

  async searchMicroSpecs(input: KnowledgeGatewayMicroSpecSearchInput = {}): Promise<KnowledgeGatewaySearchResult> {
    const limit = assertLimit(input.limit);
    const validScopes = new Set(markdownKnowledgeRelatedScopes.map((option) => option.value));
    const validTopics = new Set(markdownKnowledgeSpecTopics.map((option) => option.value));
    if (input.relatedScopes?.some((scope) => !validScopes.has(scope)) || input.specTopics?.some((topic) => !validTopics.has(topic))) {
      throw new KnowledgeGatewayError("invalid-micro-spec-filter", 400, "relatedScopes 或 specTopics 不符合正式 Micro Spec Schema。");
    }
    const { items, diagnostics } = await loadLibrary();
    const filtered = items.filter((item) => item.assetType === "micro-spec" && matchAll(item.microSpec?.relatedScopes ?? [], input.relatedScopes) && (!input.specTopics?.length || input.specTopics.includes(item.microSpec?.specTopic!)) && matchAll(item.tags, input.tags));
    const scored = await Promise.all(filtered.map(async (item) => {
      const content = await contentFor(item);
      const ranked = rank(item, input.q, content);
      const scopeScore = input.relatedScopes?.length ? 1000 : 0;
      const topicScore = input.specTopics?.length ? 800 : 0;
      return { ...item, relevance: { score: ranked.score + scopeScore + topicScore, matchedFields: [...(scopeScore ? ["relatedScopes"] : []), ...(topicScore ? ["specTopic"] : []), ...ranked.matchedFields] }, score: ranked.score + scopeScore + topicScore };
    }));
    const matched = words(input.q).length ? scored.filter((item) => item.relevance.matchedFields.some((field) => field !== "relatedScopes" && field !== "specTopic")) : scored;
    return { status: diagnostics.length ? "partial" : "ok", items: sortScored(matched).slice(0, limit).map(({ score: _score, ...item }) => item), diagnostics, partial: diagnostics.length > 0 };
  },

  async getAsset(assetTypeValue: string, id: string): Promise<KnowledgeGatewayDetailResult> {
    const assetType = ensureAssetType(assetTypeValue);
    if (!id.trim()) throw new KnowledgeGatewayError("invalid-id", 400, "id 不能为空。");
    const { items, diagnostics } = await loadLibrary();
    const asset = items.find((item) => item.assetType === assetType && item.id === id);
    if (!asset) throw new KnowledgeGatewayError("not-found", 404, "未找到该 Knowledge Gateway 资产。");
    if (["knowledge", "project", "micro-spec"].includes(assetType)) {
      return { asset, content: await contentFor(asset), diagnostics, partial: diagnostics.length > 0 };
    }
    if (assetType === "prompt") {
      const prompt = await promptService.getPromptForKnowledgeById(id);
      if (!prompt) throw new KnowledgeGatewayError("not-found", 404, "未找到该 Prompt。");
      return { asset, prompt: { models: prompt.models, scenarios: prompt.scenarios, outputTypes: prompt.outputTypes, difficulty: prompt.difficulty, content: prompt.content, usageGuide: prompt.usageGuide, exampleInput: prompt.exampleInput, exampleOutput: prompt.exampleOutput }, diagnostics, partial: diagnostics.length > 0 };
    }
    if (assetType === "skill") {
      const skill = await skillService.getSkillForKnowledgeById(id);
      if (!skill) throw new KnowledgeGatewayError("not-found", 404, "未找到该 Skill。");
      return { asset, skill: { version: skill.version, usageScenarios: skill.usageScenarios, readme: skill.readme, changeLog: skill.changeLog }, diagnostics, partial: diagnostics.length > 0 };
    }
    return { asset, diagnostics, partial: diagnostics.length > 0 };
  }
};
