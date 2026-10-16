import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { invokeRuntimeControl } from "@/lib/runtimeControl";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request) && process.env.AGENT_PUBLIC_ACCESS !== "true") return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const runtime = await invokeRuntimeControl("status");
    const visibleRuntime = isAdminRequest(request) ? runtime : { status: runtime.status, phase: runtime.phase, reasonCode: runtime.reasonCode, generation: runtime.generation, credentialStatus: runtime.credentialStatus, retryable: false };
    return NextResponse.json({ runtime: visibleRuntime }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ runtime: { status: "unavailable", phase: null, reasonCode: "runtime_control_unavailable", operationId: null, startedAt: null, generation: 0, credentialStatus: "unknown", retryable: false, shell: "ready", operation: null } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
