import { NextResponse } from "next/server";
import { assetVersionService } from "@/services/assetVersionService";
import type { AssetVersionType } from "@/types/audit";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assetType = searchParams.get("assetType") as AssetVersionType | null;
  const assetId = searchParams.get("assetId") ?? undefined;
  return NextResponse.json(await assetVersionService.getVersions(assetType ?? undefined, assetId));
}
