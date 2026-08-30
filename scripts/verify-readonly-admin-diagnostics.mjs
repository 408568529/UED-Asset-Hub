import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSafeDiagnosticReport, createOpaqueOperationId, parseRuntimeDiagnosticsSnapshot, runtimeComponents, serializeRuntimeDiagnosticsSnapshot } from "./runtime-diagnostics-contract.mjs";
import { createRuntimeControlBridge, requestRuntimeControl, runtimeControlEndpoint } from "./runtime-control-bridge.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-readonly-diagnostics-"));
const capturedAt = "2026-08-30T00:00:00.000Z";
const operationId = createOpaqueOperationId();
const sentinel = "ADMIN_PASSWORD=diagnostics-denylist-sentinel";
const snapshot = serializeRuntimeDiagnosticsSnapshot({
  snapshotVersion: 999999999, supervisorStartedAt: capturedAt,
  runtime: { shell: "ready", status: "error", phase: "recovering", reasonCode: "credential_status_unknown", retryable: true, credentialStatus: "unknown", operationId, generation: 999999999 },
  lastTransitionAt: capturedAt, recoveryCount: 999999999,
  lastRecovery: { operationId, startedAt: capturedAt, completedAt: capturedAt, outcome: "failed", generation: 999999999 },
  components: runtimeComponents.map((component) => ({ component, status: "exited", health: "unhealthy", reasonCode: component === "supervisor" ? "diagnostics_retention_failed" : "process_exited", lastTransitionAt: capturedAt, generation: 999999999, restartCount: 999999999, ownership: "unknown", lastFailure: { reasonCode: "process_exited", occurredAt: capturedAt, operation: "runtime_recovery", operationId, generation: 999999999, exitCode: 999999999, exitSignal: "SIGSEGV" }, secret: sentinel }))
}, { capturedAt });

try {
  const canonical = parseRuntimeDiagnosticsSnapshot(snapshot);
  assert.deepEqual(canonical, snapshot);
  assert.equal(parseRuntimeDiagnosticsSnapshot({ ...snapshot, token: sentinel }), null);
  const report = createSafeDiagnosticReport(canonical);
  assert.equal(report, createSafeDiagnosticReport(canonical), "report is byte-for-byte deterministic");
  assert.equal(report.includes(sentinel), false);
  const envelopeBytes = Buffer.byteLength(JSON.stringify({ ok: true, diagnostics: canonical }));
  assert(envelopeBytes < 16 * 1024, `maximum valid diagnostics envelope must fit 16 KiB; got ${envelopeBytes}`);

  const supervisor = path.join(root, "supervisor");
  await mkdir(supervisor);
  const endpoint = runtimeControlEndpoint({ supervisorDirectory: supervisor, instanceId: "test" });
  let reads = 0; let starts = 0; let events = 0;
  const bridge = createRuntimeControlBridge({ endpoint, token: "test-token", inspect: async () => { reads += 1; return {}; }, ensureReady: async () => { starts += 1; return {}; }, diagnostics: async () => snapshot, onEvent: () => { events += 1; } });
  await bridge.start();
  const beforeVersion = snapshot.snapshotVersion;
  const received = await requestRuntimeControl({ endpoint, token: "test-token", operation: "diagnostics" });
  assert.deepEqual(received, snapshot);
  assert.equal(reads, 0); assert.equal(starts, 0); assert.equal(events, 0);
  assert.equal(snapshot.snapshotVersion, beforeVersion);
  await assert.rejects(() => requestRuntimeControl({ endpoint, token: "wrong", operation: "diagnostics" }));
  await bridge.stop();
  console.log(`[Read-only Admin Diagnostics] PASS (${envelopeBytes} bytes < 16384)`);
} finally {
  await rm(root, { recursive: true, force: true });
}
