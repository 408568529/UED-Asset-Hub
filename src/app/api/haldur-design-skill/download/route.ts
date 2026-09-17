import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { HaldurSkillExportError, haldurDesignSkillExportService } from "@/services/haldurDesignSkillExportService";

export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!hasHaldurCapability(request, "haldur.export")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 });
  try {
    const exported = await haldurDesignSkillExportService.create();
    const stream = createReadStream(exported.zipPath);
    const cleanup = () => { void exported.cleanup().catch(() => undefined); };
    stream.once("close", cleanup); stream.once("error", cleanup);
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { headers: { "content-type": "application/zip", "content-length": String(exported.size), "content-disposition": 'attachment; filename="Haldur-Design-Skill.zip"', "x-haldur-revision": exported.revision } });
  } catch (error) {
    if (error instanceof HaldurSkillExportError) return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    return NextResponse.json({ code: "EXPORT_WRITE_FAILED", message: "生成 Skill 下载包失败。" }, { status: 500 });
  }
}
