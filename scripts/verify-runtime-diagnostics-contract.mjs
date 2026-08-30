import assert from "node:assert/strict";
import {
  createOpaqueOperationId,
  createSafeDiagnosticReport,
  nextRecoveryCount,
  nextRestartCount,
  runtimeComponents,
  parseRuntimeDiagnosticsSnapshot,
  serializeRuntimeDiagnosticsSnapshot
} from "./runtime-diagnostics-contract.mjs";

const capturedAt = "2026-08-30T00:00:00.000Z";
const operationId = createOpaqueOperationId();

function component(component, overrides = {}) {
  return { component, status: "running", health: "healthy", reasonCode: null, lastTransitionAt: capturedAt, generation: 2, restartCount: 1, ownership: "owned", ...overrides };
}

function snapshot(overrides = {}) {
  return serializeRuntimeDiagnosticsSnapshot({
    snapshotVersion: 7,
    supervisorStartedAt: "2026-08-29T23:00:00.000Z",
    runtime: { shell: "ready", status: "starting", phase: "recovering", reasonCode: null, retryable: false, credentialStatus: "configured", operationId, generation: 4 },
    lastTransitionAt: capturedAt,
    recoveryCount: 2,
    lastRecovery: { operationId, startedAt: capturedAt, completedAt: null, outcome: "in_progress", generation: 4 },
    components: runtimeComponents.map((name) => component(name)),
    ...overrides
  }, { capturedAt });
}

function testFixedSchemaAndCompatibility() {
  const value = snapshot();
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.status, "starting");
  assert.equal(value.phase, "recovering", "recovering remains a phase under starting");
  assert.equal(value.shell, "ready", "Agent Runtime transitions do not alter Shell state");
  assert.deepEqual(value.components.map((entry) => entry.component), runtimeComponents, "component enum and order are fixed");
  assert.equal(value.components.find((entry) => entry.component === "publicEdge")?.generation, null, "in-process servers do not invent process generations");
  assert.equal(value.components.find((entry) => entry.component === "publicEdge")?.restartCount, null, "in-process servers do not invent restart counts");
  assert.equal(value.components.find((entry) => entry.component === "publicEdge")?.ownership, "not_applicable");
}

function testOpaqueOperationIds() {
  assert.match(operationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, "operation ids are generated opaque UUIDs");
  const value = snapshot({ runtime: { shell: "ready", status: "ready", phase: null, reasonCode: null, retryable: false, credentialStatus: "configured", operationId: "pid=123,path=/private,tmp-secret" } });
  assert.equal(value.operationId, null, "encoded host data is rejected rather than exposed as an operation id");
}

function testHealthAndFailureNullability() {
  const value = snapshot({ components: [component("proxy", { health: "unknown", lastFailure: { reasonCode: "process_exited", occurredAt: capturedAt, operation: "process_restart", operationId, generation: 2, exitCode: null, exitSignal: null } })] });
  const proxy = value.components.find((entry) => entry.component === "proxy");
  assert.equal(proxy.health, "unknown", "missing evidence is never represented as healthy");
  assert.equal(proxy.lastFailure.exitCode, null);
  assert.equal(proxy.lastFailure.exitSignal, null);
  assert.equal(value.components.find((entry) => entry.component === "gateway")?.lastFailure, null, "no failure remains null");
}

function testRetentionDegradationIsIsolated() {
  const value = snapshot({
    runtime: { shell: "ready", status: "ready", phase: null, reasonCode: null, retryable: false, credentialStatus: "configured", operationId: null, generation: 4 },
    recoveryCount: 0,
    components: [component("supervisor", { health: "unhealthy", reasonCode: "diagnostics_retention_failed" })]
  });
  const supervisor = value.components.find((entry) => entry.component === "supervisor");
  assert.equal(supervisor.reasonCode, "diagnostics_retention_failed");
  assert.equal(value.status, "ready", "retention degradation cannot change Runtime availability");
  assert.equal(value.shell, "ready", "retention degradation cannot change Shell state");
  assert.equal(value.recoveryCount, 0, "retention degradation cannot trigger recovery");
  const invalidComponent = snapshot({ components: [component("proxy", { reasonCode: "diagnostics_retention_failed" })] }).components.find((entry) => entry.component === "proxy");
  assert.equal(invalidComponent.reasonCode, null, "retention degradation cannot be attributed to an Agent component");
}

function testCounters() {
  assert.equal(nextRestartCount({ currentCount: 0, hasPriorSuccessfulStart: false, pid: 10 }), 0, "initial spawn is not a restart");
  assert.equal(nextRestartCount({ currentCount: 0, hasPriorSuccessfulStart: true, pid: null }), 0, "failed spawn is not a restart");
  assert.equal(nextRestartCount({ currentCount: 2, hasPriorSuccessfulStart: true, pid: 10 }), 3, "replacement child increments restart count");
  assert.equal(nextRestartCount({ currentCount: 2, hasPriorSuccessfulStart: true, pid: 10, intentionalShutdown: true }), 2, "intentional shutdown is not a restart");
  assert.equal(nextRecoveryCount({ currentCount: 2, startsRecovery: false }), 2);
  assert.equal(nextRecoveryCount({ currentCount: 2, startsRecovery: true }), 3, "one Runtime recovery increments once regardless of components");
}

function testAllowlistAndReport() {
  const sentinel = "diagnostics-secret-sentinel";
  const value = snapshot({
    runtime: { shell: "ready", status: "configuration_required", phase: null, reasonCode: "credential_missing", retryable: false, credentialStatus: "missing", operationId, generation: 4, token: sentinel, path: sentinel },
    components: [component("dsh", { stack: sentinel, env: sentinel, stdout: sentinel, lastFailure: { reasonCode: "process_exited", occurredAt: capturedAt, operation: "runtime_recovery", operationId, generation: 2, exitCode: 1, exitSignal: "SIGTERM", rawError: sentinel } }), { component: "untrusted-component", token: sentinel }]
  });
  const output = JSON.stringify(value);
  assert.equal(output.includes(sentinel), false, "serializer excludes secrets, paths, raw errors, environment and stdout");
  assert.equal(output.includes("untrusted-component"), false, "unknown components are excluded");
  const parsed = parseRuntimeDiagnosticsSnapshot(value);
  assert.deepEqual(parsed, value, "canonical parser preserves a serializer output exactly");
  assert.equal(parseRuntimeDiagnosticsSnapshot({ ...value, token: sentinel }), null, "canonical parser rejects expanded data");
  const report = createSafeDiagnosticReport(parsed);
  assert.equal(report.includes(sentinel), false, "safe report serializes the allowlisted schema again");
  assert.equal(report.includes("Runtime Status: configuration_required"), true, "report preserves canonical runtime values");
  assert.equal(report, createSafeDiagnosticReport(parsed), "report is deterministic for the same canonical snapshot");
}

testFixedSchemaAndCompatibility();
testOpaqueOperationIds();
testHealthAndFailureNullability();
testRetentionDegradationIsIsolated();
testCounters();
testAllowlistAndReport();

console.log("[Runtime Diagnostics Contract] PASS");
