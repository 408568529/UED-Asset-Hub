import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { assetVersionService } from "@/services/assetVersionService";
import type { AssetVersionType } from "@/types/audit";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const assetType = searchParams.get("assetType") as AssetVersionType | null;
  const assetId = searchParams.get("assetId") ?? undefined;
  return NextResponse.json(await assetVersionService.getVersions(assetType ?? undefined, assetId));
}
