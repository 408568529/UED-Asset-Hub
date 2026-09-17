import { NextResponse } from "next/server";
import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { HaldurDirectoryOperationError } from "@/services/haldurDesignSkillDirectoryService";
import { haldurDesignSkillFileService } from "@/services/haldurDesignSkillFileService";

export const runtime = "nodejs";

function responseForError(error: unknown) {
  if (error instanceof HaldurDirectoryOperationError) return NextResponse.json({ code: error.code, message: error.message, currentRevision: error.currentRevision }, { status: error.status });
  return NextResponse.json({ code: "FILESYSTEM_FAILED", message: "Markdown 文件操作失败。" }, { status: 500 });
}

export async function GET(request: Request) {
  if (!hasHaldurCapability(request, "haldur.read")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有查看 Markdown 的权限。" }, { status: 403 });
  try {
    return NextResponse.json(await haldurDesignSkillFileService.readMarkdown(new URL(request.url).searchParams.get("path") ?? ""));
  } catch (error) {
    return responseForError(error);
  }
}

export async function PUT(request: Request) {
  if (!hasHaldurCapability(request, "haldur.write") || !hasHaldurCapability(request, "haldur.overwrite")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有保存 Markdown 的权限。" }, { status: 403 });
  try {
    const body = await request.json() as { path?: string; content?: string; revision?: string };
    if (typeof body.content !== "string") throw new HaldurDirectoryOperationError("INVALID_PATH", "Markdown content 必须是字符串。", 400);
    if (!body.revision?.trim()) throw new HaldurDirectoryOperationError("REVISION_CONFLICT", "缺少 Revision。", 428);
    return NextResponse.json(await haldurDesignSkillFileService.saveMarkdown({ relativePath: body.path ?? "", content: body.content, revision: body.revision, operator: "markdown-editor" }));
  } catch (error) {
    return responseForError(error);
  }
}
