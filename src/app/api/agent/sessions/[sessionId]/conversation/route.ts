import { NextResponse } from "next/server";
import { AgentAdapterError, dshRuntimeAdapter } from "@/agent-integration/adapter/dshRuntimeAdapter";
import { isAdminRequest } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function responseError(error: unknown) {
  return NextResponse.json({ message: error instanceof AgentAdapterError ? error.message : "Agent 服务暂时不可用。" }, { status: 502 });
}

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const { sessionId } = await params;
    return NextResponse.json(await dshRuntimeAdapter.getConversation(decodeURIComponent(sessionId)));
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const { sessionId } = await params;
    const body = await request.json() as { message?: unknown };
    if (typeof body.message !== "string" || !body.message.trim() || body.message.trim().length > 8000) {
      return NextResponse.json({ message: "请输入 1-8000 个字符的消息。" }, { status: 400 });
    }
    await dshRuntimeAdapter.sendPrompt(decodeURIComponent(sessionId), body.message);
    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    return responseError(error);
  }
}
