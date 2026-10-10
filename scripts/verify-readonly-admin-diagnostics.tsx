import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createOpaqueOperationId, createSafeDiagnosticReport, runtimeComponents, serializeRuntimeDiagnosticsSnapshot } from "./runtime-diagnostics-contract.mjs";
import { RuntimeDiagnosticsView, copySafeDiagnosticReport, diagnosticLabel } from "../src/components/admin/runtimeDiagnosticsPresentation";
import { respondToRuntimeDiagnosticsRequest } from "../src/lib/runtimeDiagnosticsApi";
import { RuntimeDiagnosticsError } from "../src/lib/runtimeControl";

const capturedAt = "2026-08-30T00:00:00.000Z";
const operationId = createOpaqueOperationId();
const sentinels = ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "AGENT_GATEWAY_TOKEN", "RUNTIME_CONTROL_TOKEN", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "Cookie", "Authorization", "DATA_DIR", "AGENT_RUNTIME_DIR", "DSH_SOURCE_DIR", "DSH_HOME", "command", "args", "cwd", "endpoint", "IPC/pipe", "PID", "raw error", "stack", "stdout", "stderr", "RPC body"];

function payload(overrides: Record<string, unknown> = {}) {
  const diagnostics = serializeRuntimeDiagnosticsSnapshot({
    snapshotVersion: 3, supervisorStartedAt: capturedAt,
    runtime: { shell: "ready", status: "ready", phase: null, reasonCode: null, retryable: false, credentialStatus: "configured", operationId, generation: 2 },
    lastTransitionAt: capturedAt, recoveryCount: 1, lastRecovery: { operationId, startedAt: capturedAt, completedAt: capturedAt, outcome: "succeeded", generation: 2 },
    components: runtimeComponents.map((component) => ({ component, status: "running", health: "healthy", reasonCode: null, lastTransitionAt: capturedAt, generation: 2, restartCount: 1, ownership: "owned", secret: sentinels.join(" ") })),
    ...overrides
  }, { capturedAt });
  return { diagnostics, report: createSafeDiagnosticReport(diagnostics) };
}

async function responseBody(response: Response) { const text = await response.text(); return { status: response.status, body: JSON.parse(text) as { error?: { code?: string } }, text }; }

async function testApiMatrix() {
  const request = new Request("http://asset-hub.test/api/admin/runtime-diagnostics");
  const cases: Array<[string, Request, boolean, () => Promise<ReturnType<typeof payload>>, number, string | null]> = [
    ["unauthenticated", request, false, async () => payload(), 401, "unauthorized"],
    ["unsupported query", new Request("http://asset-hub.test/api/admin/runtime-diagnostics?x=1"), true, async () => payload(), 400, "invalid_request"],
    ["valid", request, true, async () => payload(), 200, null],
    ["malformed", request, true, async () => { throw new RuntimeDiagnosticsError("runtime_diagnostics_invalid_response"); }, 502, "runtime_diagnostics_invalid_response"],
    ["oversized", request, true, async () => { throw new RuntimeDiagnosticsError("runtime_diagnostics_invalid_response"); }, 502, "runtime_diagnostics_invalid_response"],
    ["control unavailable", request, true, async () => { throw new RuntimeDiagnosticsError("runtime_control_unavailable"); }, 503, "runtime_control_unavailable"],
    ["handler unavailable", request, true, async () => { throw new RuntimeDiagnosticsError("runtime_diagnostics_unavailable"); }, 503, "runtime_diagnostics_unavailable"]
  ];
  for (const [name, input, authenticated, getPayload, status, code] of cases) {
    const response = await respondToRuntimeDiagnosticsRequest({ request: input, authenticated, getPayload });
    const { body, text } = await responseBody(response);
    assert.equal(response.status, status, name);
    assert.equal(response.headers.get("cache-control"), "no-store", `${name} is not cached`);
    if (code) assert.equal(body.error?.code, code, name);
    for (const sentinel of sentinels) assert.equal(text.includes(sentinel), false, `${name} response excludes ${sentinel}`);
  }
  await testUnsupportedMethod();
}

async function testUnsupportedMethod() {
  const port = await new Promise<number>((resolve, reject) => { const server = createServer(); server.once("error", reject); server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close((error) => error ? reject(error) : resolve(typeof address === "object" && address ? address.port : 0)); }); });
  const root = await (await import("node:fs/promises")).mkdtemp(path.join(os.tmpdir(), "ued-diagnostics-method-"));
  const environment = { ...process.env, DATA_DIR: path.join(root, "data"), AGENT_RUNTIME_DIR: path.join(root, "runtime"), DSH_HOME: path.join(root, "dsh"), TRAINING_MEDIA_DIR: path.join(root, "training"), ADMIN_PASSWORD: "isolated-password", ADMIN_SESSION_SECRET: "x".repeat(48), ADMIN_SESSION_SECURE: "false" };
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env: environment, stdio: "ignore" });
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) { try { const response = await fetch(`http://127.0.0.1:${port}/api/admin/runtime-diagnostics`, { method: "POST" }); if (response.status === 405) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); }
    throw new Error("method_405_unavailable");
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    const exit = child.exitCode !== null || child.signalCode !== null
      ? { code: child.exitCode, signal: child.signalCode }
      : await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
    if (process.platform === "win32") assert.equal(exit.signal, "SIGTERM", "isolated Next method fixture must stop on Windows");
    else assert.equal(exit.code, 0, "isolated Next method fixture must shut down normally");
    await (await import("node:fs/promises")).rm(root, { recursive: true, force: true });
  }
}

function testFixtureMatrix() {
  const fixtures = [
    ["ready", {}], ["configuration required", { runtime: { shell: "ready", status: "configuration_required", phase: "preflight", reasonCode: "credential_missing", retryable: false, credentialStatus: "missing", operationId, generation: 2 } }],
    ["unavailable error", { runtime: { shell: "unavailable", status: "error", phase: "recovering", reasonCode: "runtime_start_failed", retryable: true, credentialStatus: "unknown", operationId, generation: 2 } }],
    ["unhealthy", { components: [{ component: "dsh", status: "running", health: "unhealthy", reasonCode: "runtime_health_failed", lastTransitionAt: capturedAt, generation: 2, restartCount: 1, ownership: "owned" }] }],
    ["exited", { components: [{ component: "proxy", status: "exited", health: "unhealthy", reasonCode: "process_exited", lastTransitionAt: capturedAt, generation: 2, restartCount: 2, ownership: "owned" }] }],
    ["recovery succeeded", {}], ["recovery failed", { lastRecovery: { operationId, startedAt: capturedAt, completedAt: capturedAt, outcome: "failed", generation: 2 } }],
    ["retention", { components: [{ component: "supervisor", status: "running", health: "unhealthy", reasonCode: "diagnostics_retention_failed", lastTransitionAt: capturedAt, generation: 0, restartCount: 0, ownership: "not_applicable" }] }]
  ] as const;
  for (const [name, fixture] of fixtures) {
    const value = payload(fixture);
    const markup = renderToStaticMarkup(<RuntimeDiagnosticsView payload={value} message={null} />);
    assert(markup.includes("Scope:"), `${name} renders component scope`);
    for (const sentinel of sentinels) assert.equal(markup.includes(sentinel), false, `${name} markup excludes ${sentinel}`);
    for (const raw of ["configuration_required", "diagnostics_retention_failed", "runtime_start_failed", "process_exited"]) assert.equal(markup.includes(raw), false, `${name} does not expose raw enum ${raw}`);
  }
  const retentionMarkup = renderToStaticMarkup(<RuntimeDiagnosticsView payload={payload({ components: [{ component: "supervisor", status: "running", health: "unhealthy", reasonCode: "diagnostics_retention_failed", lastTransitionAt: capturedAt }] })} message={null} />);
  assert(retentionMarkup.includes("这不表示 Runtime、Shell 或 Agent 不可用"), "retention is observability-only presentation");
  assert.equal(diagnosticLabel("unrecognized_server_enum"), "Unknown");
  assert.equal(diagnosticLabel(null), "N/A");
}

async function testRefreshAndCopy() {
  const panel = await readFile("src/components/admin/RuntimeDiagnosticsPanel.tsx", "utf8");
  assert(panel.includes('fetch("/api/admin/runtime-diagnostics", { cache: "no-store" })'));
  assert(panel.includes("loadingRef.current"), "pending refresh is deduplicated");
  assert.equal(panel.includes("/api/runtime/start"), false, "refresh cannot start Runtime");
  const value = payload(); let copied = "";
  await copySafeDiagnosticReport(value.report, async (report) => { copied = report; });
  assert.equal(copied, value.report, "copy uses the API safe report exactly");
  for (const sentinel of sentinels) assert.equal(copied.includes(sentinel), false);
}

async function main() {
  await testApiMatrix();
  testFixtureMatrix();
  await testRefreshAndCopy();
  console.log("[Read-only Admin Diagnostics Matrix] PASS");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
