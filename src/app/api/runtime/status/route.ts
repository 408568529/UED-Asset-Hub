import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { invokeRuntimeControl } from "@/lib/runtimeControl";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ runtime: await invokeRuntimeControl("status") }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ runtime: { status: "unavailable", phase: null, reasonCode: "runtime_control_unavailable", operationId: null, startedAt: null, generation: 0, credentialStatus: "unknown", shell: "ready", operation: null } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
