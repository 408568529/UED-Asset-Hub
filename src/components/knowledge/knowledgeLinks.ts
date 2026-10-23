import { knowledgeModuleHrefs } from "@/config/modules";

type DetailType = "skill" | "font" | "prompt" | "training";
const detailModules = { skill: "skills", font: "fonts", prompt: "prompts", training: "training" } as const;

export function searchReturnHref(value: unknown): string | undefined {
  return typeof value === "string" && (value === "/search" || value.startsWith("/search?")) ? value : undefined;
}

export function knowledgeListHref(module: keyof typeof knowledgeModuleHrefs, query: { q?: string; model?: string } = {}) {
  const url = new URL(knowledgeModuleHrefs[module], "http://localhost");
  if (query.q) url.searchParams.set("q", query.q);
  if (query.model && query.model !== "全部") url.searchParams.set("tag", query.model);
  return `${url.pathname}${url.search}`;
}

export function knowledgeDetailHref(type: DetailType, id: string, returnTo?: string) {
  const url = new URL(knowledgeListHref(detailModules[type]), "http://localhost");
  url.searchParams.set("asset", `${type}:${id}`);
  const searchReturn = searchReturnHref(returnTo);
  if (searchReturn) url.searchParams.set("returnTo", searchReturn);
  return `${url.pathname}${url.search}`;
}
