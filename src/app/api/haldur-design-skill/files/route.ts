import { decodeHaldurHeader } from "@/lib/haldur/uploadHeaders";
import path from "node:path";
import { NextResponse } from "next/server";
import { hasHaldurCapability } from "@/lib/haldurPermissions";
import { HaldurDirectoryOperationError } from "@/services/haldurDesignSkillDirectoryService";
import { haldurDesignSkillFileService } from "@/services/haldurDesignSkillFileService";

export const runtime = "nodejs";

function revisionFrom(request: Request) {
  const revision = request.headers.get("if-match")?.trim();
  if (!revision) throw new HaldurDirectoryOperationError("REVISION_CONFLICT", "缺少 If-Match Revision。", 428);
  return revision;
}

function responseForError(error: unknown) {
  if (error instanceof HaldurDirectoryOperationError) return NextResponse.json({ code: error.code, message: error.message, currentRevision: error.currentRevision }, { status: error.status });
  return NextResponse.json({ code: "FILESYSTEM_FAILED", message: "Haldur 文件操作失败。" }, { status: 500 });
}

function requiredHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new HaldurDirectoryOperationError("INVALID_PATH", `缺少 ${name}。`, 400);
  return decodePathHeader(request, value);
}

function decodePathHeader(request: Request, value: string) {
  try { return decodeHaldurHeader(value, request.headers.get("x-haldur-path-encoding")); }
  catch { throw new HaldurDirectoryOperationError("INVALID_PATH", "文件名或目录编码无效。", 400); }
}

function parentPathHeader(request: Request) {
  const value = request.headers.get("x-haldur-parent-path");
  if (value === null) throw new HaldurDirectoryOperationError("INVALID_PATH", "缺少 x-haldur-parent-path。", 400);
  return decodePathHeader(request, value);
}

async function* requestBodyChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return;
      yield part.value;
    }
  } finally {
    reader.releaseLock();
  }
}

function contentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return ({ ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8", ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".zip": "application/zip" } as Record<string, string>)[extension] ?? "application/octet-stream";
}

export async function POST(request: Request) {
  if (!hasHaldurCapability(request, "haldur.write") || (request.headers.get("x-haldur-overwrite") === "true" && !hasHaldurCapability(request, "haldur.overwrite"))) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 });
  try {
    if (!request.body) throw new HaldurDirectoryOperationError("STAGING_FAILED", "上传请求缺少文件流。", 400);
    const result = await haldurDesignSkillFileService.upload({
      targetParentRelativePath: parentPathHeader(request),
      originalFileName: requiredHeader(request, "x-haldur-file-name"),
      revision: revisionFrom(request),
      overwrite: request.headers.get("x-haldur-overwrite") === "true",
      source: requestBodyChunks(request.body),
      mime: request.headers.get("content-type") ?? undefined,
      operator: "admin"
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return responseForError(error);
  }
}

export async function PATCH(request: Request) {
  if (!hasHaldurCapability(request, "haldur.write")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 });
  try {
    const body = await request.json() as { action?: string; sourceRelativePath?: string; newFileName?: string; targetParentRelativePath?: string };
    const revision = revisionFrom(request);
    if (body.action === "rename") return NextResponse.json(await haldurDesignSkillFileService.rename({ sourceRelativePath: body.sourceRelativePath ?? "", newFileName: body.newFileName ?? "", revision, operator: "admin" }));
    if (body.action === "move") return NextResponse.json(await haldurDesignSkillFileService.move({ sourceRelativePath: body.sourceRelativePath ?? "", targetParentRelativePath: body.targetParentRelativePath ?? "", revision, operator: "admin" }));
    throw new HaldurDirectoryOperationError("INVALID_PATH", "action 必须是 rename 或 move。", 400);
  } catch (error) {
    return responseForError(error);
  }
}

export async function DELETE(request: Request) {
  if (!hasHaldurCapability(request, "haldur.delete")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 });
  try {
    const body = await request.json() as { sourceRelativePath?: string };
    return NextResponse.json(await haldurDesignSkillFileService.delete({ sourceRelativePath: body.sourceRelativePath ?? "", revision: revisionFrom(request), operator: "admin" }));
  } catch (error) {
    return responseForError(error);
  }
}

export async function GET(request: Request) {
  if (!hasHaldurCapability(request, "haldur.read")) return NextResponse.json({ code: "PERMISSION_DENIED", message: "你没有执行此操作的权限。" }, { status: 403 });
  try {
    const relativePath = new URL(request.url).searchParams.get("path") ?? "";
    const download = await haldurDesignSkillFileService.download(relativePath);
    return new Response(download.stream, { headers: { "content-type": contentType(download.name), "content-length": String(download.size), "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(download.name)}`, "x-content-type-options": "nosniff" } });
  } catch (error) {
    return responseForError(error);
  }
}
