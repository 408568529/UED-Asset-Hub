import { NextResponse } from "next/server";
import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { HaldurDirectoryOperationError } from "@/services/haldurDesignSkillDirectoryService";
import { haldurDesignSkillReplaceService as replacement } from "@/services/haldurDesignSkillReplaceService";
export const runtime = "nodejs";
function allowed(request: Request) { return (["haldur.write", "haldur.overwrite", "haldur.delete"] as const).every(capability => hasHaldurCapability(request, capability)); }
async function respond(request: Request, action: () => Promise<unknown>) {
  if (!allowed(request)) return NextResponse.json({ code: "PERMISSION_DENIED", message: "完整覆盖仅允许管理员操作。" }, { status: 403 });
  try { return NextResponse.json(await action(), { headers: { "cache-control": "private, no-store" } }); }
  catch (error) { return NextResponse.json({ code: error instanceof HaldurDirectoryOperationError ? error.code : "FILESYSTEM_FAILED", message: error instanceof HaldurDirectoryOperationError ? error.message : "整批处理失败，请核对批次结果。" }, { status: error instanceof HaldurDirectoryOperationError ? error.status : 500 }); }
}
export async function POST(request: Request) {
  return respond(request, async () => {
    const body = await request.json();
    const revision = request.headers.get("if-match")?.trim();
    if (!revision) throw new HaldurDirectoryOperationError("REVISION_CONFLICT", "缺少If-Match版本。", 428);
    if (body.action === "prepare") return replacement.prepare({ revision, files: body.files, directories: body.directories });
    if (body.action === "commit") return replacement.commit(body.id, revision, "admin");
    throw new HaldurDirectoryOperationError("INVALID_PATH", "未知完整覆盖操作。", 400);
  });
}
export async function PUT(request: Request) {
  return respond(request, async () => {
    const params = new URL(request.url).searchParams;
    const reader = request.body?.getReader();
    async function* chunks() { if (!reader) return; try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; yield chunk.value; } } finally { reader.releaseLock(); } }
    return replacement.upload(params.get("id") ?? "", Number(params.get("index")), chunks());
  });
}
export async function GET(request: Request) { return respond(request, () => replacement.status(new URL(request.url).searchParams.get("id") ?? "")); }
