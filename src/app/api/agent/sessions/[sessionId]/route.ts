import { NextResponse } from "next/server";
import { AgentAdapterError, dshRuntimeAdapter } from "@/agent-integration/adapter/dshRuntimeAdapter";
import { isAdminRequest } from "@/lib/adminAuth";

function responseError(error: unknown) {
  return NextResponse.json({ message: error instanceof AgentAdapterError ? error.message : "Agent 服务暂时不可用。" }, { status: 502 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const { sessionId } = await params;
    const body = await request.json() as { title?: unknown };
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120) return NextResponse.json({ message: "请输入 1-120 个字符的会话名称。" }, { status: 400 });
    await dshRuntimeAdapter.renameSession(decodeURIComponent(sessionId), body.title);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const { sessionId } = await params;
    await dshRuntimeAdapter.archiveSession(decodeURIComponent(sessionId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return responseError(error);
  }
}
