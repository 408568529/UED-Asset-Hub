import { NextResponse } from "next/server";
import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { readHaldurPreview, HaldurPreviewError } from "@/services/haldurFilePreviewService";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!hasHaldurCapability(request, "haldur.read")) return NextResponse.json({ message: "无预览权限。" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  try { return NextResponse.json(await readHaldurPreview(params.get("entry") ?? params.get("path") ?? "", params.get("path") ?? ""), { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } }); }
  catch (error) { return NextResponse.json({ code: error instanceof HaldurPreviewError ? error.code : "PREVIEW_FAILED", message: error instanceof HaldurPreviewError ? error.message : "无法读取预览。" }, { status: error instanceof HaldurPreviewError ? error.status : 500 }); }
}
