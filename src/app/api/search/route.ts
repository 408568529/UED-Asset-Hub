import { NextResponse } from "next/server";
import { searchService } from "@/services/searchService";
import type { SearchAssetType } from "@/types/search";

const supportedTypes: SearchAssetType[] = ["product", "component", "sop", "skill", "font", "prompt", "training", "test-environment"];

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const types = searchParams.getAll("type").filter((type): type is SearchAssetType => supportedTypes.includes(type as SearchAssetType));
  return NextResponse.json(await searchService.search({
    keyword: searchParams.get("q") ?? undefined,
    types,
    tags: searchParams.getAll("tag")
  }));
}
