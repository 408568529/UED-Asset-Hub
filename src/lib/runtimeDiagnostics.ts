import "server-only";
import { createSafeDiagnosticReport } from "../../scripts/runtime-diagnostics-contract.mjs";
import type { RuntimeDiagnosticsSnapshot } from "../../scripts/runtime-diagnostics-contract.mjs";
import { invokeRuntimeDiagnostics } from "@/lib/runtimeControl";

export type RuntimeDiagnosticsPayload = { diagnostics: RuntimeDiagnosticsSnapshot; report: string };

export async function getRuntimeDiagnosticsPayload(): Promise<RuntimeDiagnosticsPayload> {
  const diagnostics = await invokeRuntimeDiagnostics();
  return { diagnostics, report: createSafeDiagnosticReport(diagnostics) };
}
