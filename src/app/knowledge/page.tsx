import { KnowledgeWorkspaceDetail, type KnowledgeWorkspaceDetailData } from "@/components/knowledge/KnowledgeWorkspaceDetail";
import { KnowledgeLibraryWorkspace } from "@/components/knowledge/KnowledgeLibraryWorkspace";
import { fontService } from "@/services/fontService";
import { knowledgeAggregatorService } from "@/services/knowledgeAggregatorService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import { trainingService } from "@/services/trainingService";
import { knowledgeAssetTypes, knowledgeSections, knowledgeSorts, type KnowledgeLibraryQuery } from "@/types/knowledge";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseQuery(params: Record<string, string | string[] | undefined>): KnowledgeLibraryQuery {
  const section = first(params.section);
  const type = first(params.type);
  const sort = first(params.sort);
  const asset = first(params.asset);
  const [assetType] = asset?.split(":") ?? [];
  return {
    section: section === "all" || knowledgeSections.includes(section as (typeof knowledgeSections)[number]) ? section as KnowledgeLibraryQuery["section"] : undefined,
    type: knowledgeAssetTypes.includes(type as (typeof knowledgeAssetTypes)[number]) ? type as KnowledgeLibraryQuery["type"] : undefined,
    asset: asset && asset.includes(":") && knowledgeAssetTypes.includes(assetType as (typeof knowledgeAssetTypes)[number]) ? asset as KnowledgeLibraryQuery["asset"] : undefined,
    category: first(params.category)?.trim() || undefined,
    tag: first(params.tag)?.trim() || undefined,
    q: first(params.q)?.trim() || undefined,
    sort: knowledgeSorts.includes(sort as (typeof knowledgeSorts)[number]) ? sort as KnowledgeLibraryQuery["sort"] : "updated-desc"
  };
}

function buildListHref(query: KnowledgeLibraryQuery) {
  const params = new URLSearchParams();
  if (query.section && query.section !== "all") params.set("section", query.section);
  if (query.type) params.set("type", query.type);
  if (query.category) params.set("category", query.category);
  if (query.tag) params.set("tag", query.tag);
  if (query.q) params.set("q", query.q);
  if (query.sort && query.sort !== "updated-desc") params.set("sort", query.sort);
  const value = params.toString();
  return value ? `/knowledge?${value}` : "/knowledge";
}

async function getWorkspaceDetail(assetKey: KnowledgeLibraryQuery["asset"], fallback: Awaited<ReturnType<typeof knowledgeAggregatorService.getLibrary>>): Promise<KnowledgeWorkspaceDetailData | null> {
  if (!assetKey) return null;
  const asset = fallback.items.find((item) => item.key === assetKey && item.route.kind === "internal");
  if (!asset) return null;

  if (asset.assetType === "prompt") {
    const item = (await promptService.getPromptsForKnowledge()).find((prompt) => prompt.id === asset.id);
    return item ? { asset, kind: "prompt", item } : null;
  }
  if (asset.assetType === "skill") {
    const [skills, versions] = await Promise.all([skillService.getSkillsForKnowledge(), skillService.getSkillVersionsForKnowledge(asset.id)]);
    const item = skills.find((skill) => skill.id === asset.id);
    return item ? { asset, kind: "skill", item, versions } : null;
  }
  if (asset.assetType === "font") {
    const [fonts, versions] = await Promise.all([fontService.getFontsForKnowledge(), fontService.getFontVersionsForKnowledge(asset.id)]);
    const item = fonts.find((font) => font.id === asset.id);
    return item ? { asset, kind: "font", item, versions } : null;
  }
  if (asset.assetType === "training") {
    const item = (await trainingService.getVideosForKnowledge()).find((video) => video.id === asset.id);
    return item ? { asset, kind: "training", item } : null;
  }
  return null;
}

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = parseQuery(await searchParams);
  const result = await knowledgeAggregatorService.getLibrary(query);
  const allItems = query.asset && !result.items.some((item) => item.key === query.asset)
    ? await knowledgeAggregatorService.getLibrary()
    : result;
  const detail = await getWorkspaceDetail(query.asset, allItems);
  return detail ? <KnowledgeLibraryWorkspace result={result} query={query}><KnowledgeWorkspaceDetail detail={detail} backHref={buildListHref(query)} /></KnowledgeLibraryWorkspace> : <KnowledgeLibraryWorkspace result={result} query={query} />;
}
