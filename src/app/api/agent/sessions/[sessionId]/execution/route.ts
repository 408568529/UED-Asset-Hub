import { NextResponse } from "next/server";
import { AgentAdapterError, dshRuntimeAdapter } from "@/agent-integration/adapter/dshRuntimeAdapter";
import { isAdminRequest } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const { sessionId } = await params;
    return NextResponse.json(await dshRuntimeAdapter.getExecutionSnapshot(decodeURIComponent(sessionId)));
  } catch (error) {
    return NextResponse.json({ message: error instanceof AgentAdapterError ? error.message : "Agent 服务暂时不可用。" }, { status: 502 });
  }
}
