import { componentSpecService } from "@/services/componentSpecService";
import { fontService } from "@/services/fontService";
import { productService } from "@/services/productService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";
import { testEnvironmentService } from "@/services/testEnvironmentService";
import { trainingService } from "@/services/trainingService";
import type { SearchParams, SearchResult } from "@/types/search";

type Candidate = Omit<SearchResult, "score"> & { searchText: string };

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

function rank(candidate: Candidate, keyword: string) {
  if (!keyword) return 100;
  const title = normalize(candidate.title);
  const description = normalize(candidate.excerpt);
  const tags = normalize(candidate.tags.join(" "));
  const author = normalize(candidate.author ?? "");
  const searchText = normalize(candidate.searchText);
  if (title === keyword) return 1000;
  if (title.startsWith(keyword)) return 850;
  if (title.includes(keyword)) return 700;
  if (tags.includes(keyword) || author.includes(keyword)) return 500;
  if (description.includes(keyword)) return 350;
  if (searchText.includes(keyword)) return 200;
  return -1;
}

export const searchService = {
  async search(params: SearchParams = {}): Promise<SearchResult[]> {
    const [products, components, sops, skills, fonts, prompts, trainingVideos, environments] = await Promise.all([
      productService.getProducts(),
      componentSpecService.getComponents(),
      sopService.getSops(),
      skillService.getSkills(),
      fontService.getFonts(),
      promptService.getPrompts(),
      trainingService.getVideos(),
      testEnvironmentService.getEnvironments()
    ]);

    const candidates: Candidate[] = [
      ...products.map((item) => ({ id: item.id, type: "product" as const, typeLabel: "Vibe Product", title: item.name, excerpt: item.description, tags: item.tags ?? [], updatedAt: item.updatedAt, url: item.link, searchText: `${item.name} ${item.description} ${item.link} ${(item.tags ?? []).join(" ")}` })),
      ...components.map((item) => ({ id: item.id, type: "component" as const, typeLabel: "组件规范", title: item.name, excerpt: item.description, tags: item.tags ?? [], updatedAt: item.updatedAt, url: item.docLink, searchText: `${item.name} ${item.description} ${item.docLink} ${item.figmaLink ?? ""} ${(item.tags ?? []).join(" ")}` })),
      ...sops.map((item) => ({ id: item.id, type: "sop" as const, typeLabel: "标准 SOP", title: item.name, excerpt: item.description, tags: item.tags ?? [], author: item.owner, updatedAt: item.updatedAt, url: item.docLink, searchText: `${item.name} ${item.description} ${item.owner ?? ""} ${(item.tags ?? []).join(" ")}` })),
      ...skills.map((item) => ({ id: item.id, type: "skill" as const, typeLabel: "Skill", title: item.name, excerpt: item.description, tags: [...item.tags, ...item.usageScenarios], author: item.authorName, updatedAt: item.updatedAt, url: `/skills/${item.id}`, searchText: `${item.name} ${item.description} ${item.category} ${item.version} ${item.authorName} ${item.uploadedBy} ${item.tags.join(" ")} ${item.usageScenarios.join(" ")}` })),
      ...fonts.map((item) => ({ id: item.id, type: "font" as const, typeLabel: "字体", title: item.name, excerpt: item.description, tags: item.tags, author: item.designer, updatedAt: item.updatedAt, url: `/fonts/${item.id}`, searchText: `${item.name} ${item.description} ${item.category} ${item.fileFormat} ${item.designer ?? ""} ${item.tags.join(" ")}` })),
      ...prompts.map((item) => ({ id: item.id, type: "prompt" as const, typeLabel: "Prompt", title: item.name, excerpt: item.summary, tags: [...item.tags, ...item.scenarios, ...item.models], author: item.author, updatedAt: item.updatedAt, url: `/prompts/${item.id}`, searchText: `${item.name} ${item.summary} ${item.category} ${item.author} ${item.tags.join(" ")} ${item.models.join(" ")} ${item.scenarios.join(" ")} ${item.content}` })),
      ...trainingVideos.map((item) => ({ id: item.id, type: "training" as const, typeLabel: "培训资料", title: item.title, excerpt: item.description || item.groupName, tags: item.tags, author: item.speaker, updatedAt: item.updatedAt, url: `/training/${item.id}`, searchText: `${item.title} ${item.description ?? ""} ${item.groupName} ${item.speaker ?? ""} ${item.tags.join(" ")}` })),
      ...environments.map((item) => ({ id: item.id, type: "test-environment" as const, typeLabel: "测试环境", title: `${item.productName} / ${item.clientVersionName} / ${item.environmentName}`, excerpt: `${item.environmentType} · ${item.status}`, tags: item.tags, author: item.createdBy, updatedAt: item.updatedAt, url: "/test-environments", searchText: `${item.productName} ${item.clientVersionName} ${item.environmentName} ${item.environmentType} ${item.tags.join(" ")}` }))
    ];

    const keyword = normalize(params.keyword ?? "");
    const typeFilter = new Set(params.types ?? []);
    const tagFilter = new Set((params.tags ?? []).map(normalize));

    return candidates
      .filter((candidate) => !typeFilter.size || typeFilter.has(candidate.type))
      .filter((candidate) => !tagFilter.size || candidate.tags.some((tag) => tagFilter.has(normalize(tag))))
      .map((candidate) => ({ ...candidate, score: rank(candidate, keyword) }))
      .filter((candidate) => candidate.score >= 0)
      .sort((a, b) => b.score - a.score || +new Date(b.updatedAt) - +new Date(a.updatedAt))
      .map(({ searchText: _, ...result }) => result);
  }
};
