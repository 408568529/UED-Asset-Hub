import { NextResponse } from "next/server";
import { RuntimeDiagnosticsError } from "@/lib/runtimeControl";
import type { RuntimeDiagnosticsPayload } from "@/lib/runtimeDiagnostics";

const headers = { "Cache-Control": "no-store" };
const failure = (code: string, status: number) => NextResponse.json({ error: { code } }, { status, headers });

export async function respondToRuntimeDiagnosticsRequest({ request, authenticated, getPayload }: { request: Request; authenticated: boolean; getPayload: () => Promise<RuntimeDiagnosticsPayload> }) {
  if (!authenticated) return failure("unauthorized", 401);
  if (new URL(request.url).search) return failure("invalid_request", 400);
  try { return NextResponse.json(await getPayload(), { headers }); }
  catch (error) {
    if (error instanceof RuntimeDiagnosticsError) return failure(error.code, error.code === "runtime_diagnostics_invalid_response" ? 502 : 503);
    return failure("runtime_diagnostics_unavailable", 503);
  }
}
