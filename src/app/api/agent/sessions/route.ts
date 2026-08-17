import { NextResponse } from "next/server";
import { AgentAdapterError, dshRuntimeAdapter } from "@/agent-integration/adapter/dshRuntimeAdapter";
import { isAdminRequest } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

function responseError(error: unknown) {
  return NextResponse.json({ message: error instanceof AgentAdapterError ? error.message : "Agent 服务暂时不可用。" }, { status: 502 });
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await dshRuntimeAdapter.listSessions());
  } catch (error) {
    return responseError(error);
  }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await dshRuntimeAdapter.createSession(), { status: 201 });
  } catch (error) {
    return responseError(error);
  }
}
