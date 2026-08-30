import { isAdminRequest } from "@/lib/adminAuth";
import { getRuntimeDiagnosticsPayload } from "@/lib/runtimeDiagnostics";
import { respondToRuntimeDiagnosticsRequest } from "@/lib/runtimeDiagnosticsApi";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return respondToRuntimeDiagnosticsRequest({ request, authenticated: isAdminRequest(request), getPayload: getRuntimeDiagnosticsPayload });
}
