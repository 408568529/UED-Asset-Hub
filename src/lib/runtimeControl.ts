import { createConnection } from "node:net";
import { parseRuntimeDiagnosticsSnapshot } from "../../scripts/runtime-diagnostics-contract.mjs";
import type { RuntimeDiagnosticsSnapshot } from "../../scripts/runtime-diagnostics-contract.mjs";

const maximumResponseBytes = 16 * 1024;

export type RuntimeState = {
  status: "unavailable" | "starting" | "ready" | "configuration_required" | "error";
  phase: string | null;
  reasonCode: string | null;
  operationId: string | null;
  startedAt: string | null;
  generation: number;
  credentialStatus: "configured" | "missing" | "unknown";
  retryable: boolean;
  shell: "ready" | "unavailable";
  operation: { operationId: string | null; startedAt: string | null; phase: string | null; generation: number } | null;
};

function requireControlConfig() {
  const endpoint = process.env.RUNTIME_CONTROL_ENDPOINT;
  const token = process.env.RUNTIME_CONTROL_TOKEN;
  if (!endpoint || !token) throw new Error("Runtime control is unavailable.");
  return { endpoint, token };
}

function isRuntimeState(value: unknown): value is RuntimeState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<RuntimeState>;
  return ["unavailable", "starting", "ready", "configuration_required", "error"].includes(String(state.status))
    && ["configured", "missing", "unknown"].includes(String(state.credentialStatus))
    && typeof state.retryable === "boolean"
    && ["ready", "unavailable"].includes(String(state.shell));
}

export async function invokeRuntimeControl(operation: "status" | "start"): Promise<RuntimeState> {
  const { endpoint, token } = requireControlConfig();
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    const succeed = (value: RuntimeState) => { if (settled) return; settled = true; clearTimeout(timeout); resolve(value); };
    const fail = (error: Error) => { if (settled) return; settled = true; clearTimeout(timeout); reject(error); };
    const socket = createConnection(endpoint);
    const timeout = setTimeout(() => { socket.destroy(); fail(new Error("Runtime control timed out.")); }, 5_000);
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${JSON.stringify({ token, operation })}\n`));
    socket.on("data", (chunk) => { output += chunk; if (Buffer.byteLength(output) > maximumResponseBytes) socket.destroy(); });
    socket.once("error", () => fail(new Error("Runtime control is unavailable.")));
    socket.once("end", () => {
      try {
        const body = JSON.parse(output) as { ok?: unknown; runtime?: unknown };
        if (body.ok !== true || !isRuntimeState(body.runtime)) throw new Error("Runtime control failed.");
        succeed(body.runtime);
      } catch { fail(new Error("Runtime control failed.")); }
    });
  });
}

export class RuntimeDiagnosticsError extends Error {
  constructor(public readonly code: "runtime_control_unavailable" | "runtime_diagnostics_unavailable" | "runtime_diagnostics_invalid_response") {
    super(code);
  }
}

export async function invokeRuntimeDiagnostics(): Promise<RuntimeDiagnosticsSnapshot> {
  let endpoint: string;
  let token: string;
  try { ({ endpoint, token } = requireControlConfig()); }
  catch { throw new RuntimeDiagnosticsError("runtime_control_unavailable"); }
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    const fail = (code: RuntimeDiagnosticsError["code"]) => { if (settled) return; settled = true; clearTimeout(timeout); reject(new RuntimeDiagnosticsError(code)); };
    const succeed = (value: RuntimeDiagnosticsSnapshot) => { if (settled) return; settled = true; clearTimeout(timeout); resolve(value); };
    const socket = createConnection(endpoint);
    const timeout = setTimeout(() => { socket.destroy(); fail("runtime_control_unavailable"); }, 5_000);
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${JSON.stringify({ token, operation: "diagnostics" })}\n`));
    socket.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > maximumResponseBytes) { socket.destroy(); fail("runtime_diagnostics_invalid_response"); }
    });
    socket.once("error", () => fail("runtime_control_unavailable"));
    socket.once("end", () => {
      try {
        const body = JSON.parse(output) as { ok?: unknown; reasonCode?: unknown; diagnostics?: unknown };
        if (body.ok !== true) throw new RuntimeDiagnosticsError(body.reasonCode === "runtime_diagnostics_unavailable" ? "runtime_diagnostics_unavailable" : "runtime_control_unavailable");
        const diagnostics = parseRuntimeDiagnosticsSnapshot(body.diagnostics);
        if (!diagnostics) throw new RuntimeDiagnosticsError("runtime_diagnostics_invalid_response");
        succeed(diagnostics);
      } catch (error) {
        fail(error instanceof RuntimeDiagnosticsError ? error.code : "runtime_diagnostics_invalid_response");
      }
    });
  });
}

export function acceptsSameOriginJsonMutation(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const contentType = request.headers.get("content-type") ?? "";
  const fetchSite = request.headers.get("sec-fetch-site");
  if (!origin || !host || host.includes(",") || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") return false;
  try {
    const originUrl = new URL(origin);
    if (!new Set(["http:", "https:"]).has(originUrl.protocol) || originUrl.host.toLowerCase() !== host.toLowerCase()) return false;
  } catch { return false; }
  return !fetchSite || fetchSite === "same-origin";
}
