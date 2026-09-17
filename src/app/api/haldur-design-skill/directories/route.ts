import { NextResponse } from "next/server";
import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { HaldurDirectoryOperationError, haldurDesignSkillDirectoryService } from "@/services/haldurDesignSkillDirectoryService";

function revisionFrom(request: Request) {
  const revision = request.headers.get("if-match")?.trim();
  if (!revision) throw new HaldurDirectoryOperationError("REVISION_CONFLICT", "缺少 If-Match Revision。", 428);
  return revision;
}

function responseForError(error: unknown) {
  if (error instanceof HaldurDirectoryOperationError) {
    return NextResponse.json({ code: error.code, message: error.message, currentRevision: error.currentRevision }, { status: error.status });
  }
  return NextResponse.json({ code: "FILESYSTEM_FAILED", message: "Haldur 目录操作失败。" }, { status: 500 });
}

export async function POST(request: Request) {
  if (!hasHaldurCapability(request, "haldur.write")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 });
  try {
    const body = await request.json() as { parentRelativePath?: string; directoryName?: string };
    return NextResponse.json(await haldurDesignSkillDirectoryService.createDirectory({ parentRelativePath: body.parentRelativePath ?? "", directoryName: body.directoryName ?? "", revision: revisionFrom(request), operator: "admin" }), { status: 201 });
  } catch (error) {
    return responseForError(error);
  }
}

export async function PATCH(request: Request) {
  if (!hasHaldurCapability(request, "haldur.write")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 });
  try {
    const body = await request.json() as { action?: string; sourceRelativePath?: string; directoryName?: string; targetParentRelativePath?: string };
    const revision = revisionFrom(request);
    if (body.action === "rename") return NextResponse.json(await haldurDesignSkillDirectoryService.renameDirectory({ sourceRelativePath: body.sourceRelativePath ?? "", directoryName: body.directoryName ?? "", revision, operator: "admin" }));
    if (body.action === "move") return NextResponse.json(await haldurDesignSkillDirectoryService.moveDirectory({ sourceRelativePath: body.sourceRelativePath ?? "", targetParentRelativePath: body.targetParentRelativePath ?? "", revision, operator: "admin" }));
    throw new HaldurDirectoryOperationError("INVALID_PATH", "action 必须是 rename 或 move。", 400);
  } catch (error) {
    return responseForError(error);
  }
}

export async function DELETE(request: Request) {
  if (!hasHaldurCapability(request, "haldur.delete")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 });
  try {
    const body = await request.json() as { sourceRelativePath?: string };
    return NextResponse.json(await haldurDesignSkillDirectoryService.deleteDirectory({ sourceRelativePath: body.sourceRelativePath ?? "", revision: revisionFrom(request), operator: "admin" }));
  } catch (error) {
    return responseForError(error);
  }
}
