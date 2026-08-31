import { randomUUID } from "node:crypto";

export const runtimeComponents = Object.freeze(["supervisor", "publicEdge", "assetHubInternal", "runtimeControl", "gateway", "dsh", "proxy"]);
export const runtimeComponentScopes = Object.freeze({
  supervisor: "runtime_infrastructure",
  publicEdge: "shell",
  assetHubInternal: "shell",
  runtimeControl: "runtime_infrastructure",
  gateway: "agent_runtime",
  dsh: "agent_runtime",
  proxy: "agent_runtime"
});
export const managedRuntimeComponents = new Set(["assetHubInternal", "gateway", "dsh", "proxy"]);

export const runtimeStatuses = Object.freeze(["unavailable", "starting", "shutting_down", "ready", "configuration_required", "error"]);
export const runtimePhases = Object.freeze(["preflight", "initializing-runtime-dir", "starting-gateway", "starting-dsh", "starting-proxy", "health-check", "recovering", "stopping"]);
export const componentStatuses = Object.freeze(["unknown", "not_started", "starting", "running", "stopping", "stopped", "exited", "failed"]);
export const componentHealths = Object.freeze(["unknown", "healthy", "unhealthy", "not_applicable"]);
export const ownershipStates = Object.freeze(["owned", "not_owned", "unknown", "not_applicable"]);
export const credentialStatuses = Object.freeze(["configured", "missing", "unknown"]);
export const failureOperations = Object.freeze(["initial_start", "manual_start", "process_restart", "runtime_recovery", "health_check", "metadata_persistence", "retention", "shutdown"]);
export const recoveryOutcomes = Object.freeze(["in_progress", "succeeded", "failed"]);
export const exitSignals = Object.freeze(["SIGTERM", "SIGKILL", "SIGINT", "SIGHUP", "SIGABRT", "SIGSEGV", "SIGBUS", "SIGILL", "SIGFPE", "SIGQUIT", "unknown"]);

const preservedRuntimeReasonCodes = new Set([
  "runtime_configuration_invalid", "source_invalid", "build_missing", "build_invalid", "port_conflict",
  "runtime_ownership_conflict", "runtime_lock_conflict", "orphan_processes_detected", "dsh_unavailable",
  "runtime_health_failed", "runtime_degraded", "runtime_start_failed", "recovery_failed",
  "agent_configuration_invalid", "credential_missing", "credential_status_unknown",
  "runtime_control_unavailable", "metadata_persistence_failed"
]);
const diagnosticsReasonCodes = new Set([
  ...preservedRuntimeReasonCodes,
  "process_start_failed", "process_exited", "health_check_failed", "restart_failed", "shutdown_failed",
  "runtime_control_failed", "diagnostics_retention_failed", "runtime_unknown_failure"
]);
const opaqueOperationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function included(values, value) {
  return values.includes(value);
}

function nonNegativeInteger(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function timestamp(value) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value ? null : value;
}

function opaqueOperationId(value) {
  return typeof value === "string" && opaqueOperationIdPattern.test(value) ? value : null;
}

function diagnosticReasonCode(value, { topLevel = false } = {}) {
  if (value === null || value === undefined) return null;
  if (topLevel && value === "diagnostics_retention_failed") return null;
  if (diagnosticsReasonCodes.has(value) && (!topLevel || preservedRuntimeReasonCodes.has(value) || value === "runtime_unknown_failure")) return value;
  return "runtime_unknown_failure";
}

function componentInputMap(components) {
  const values = new Map();
  for (const component of Array.isArray(components) ? components : []) {
    if (component && runtimeComponents.includes(component.component) && !values.has(component.component)) values.set(component.component, component);
  }
  return values;
}

function safeExitSignal(value) {
  if (value === null || value === undefined) return null;
  return included(exitSignals, value) ? value : "unknown";
}

function safeFailure(value, component) {
  if (!value || typeof value !== "object") return null;
  const occurredAt = timestamp(value.occurredAt);
  const operation = included(failureOperations, value.operation) ? value.operation : null;
  if (!occurredAt || !operation) return null;
  return {
    reasonCode: value.reasonCode === "diagnostics_retention_failed" && component !== "supervisor"
      ? null
      : diagnosticReasonCode(value.reasonCode),
    occurredAt,
    operation,
    operationId: opaqueOperationId(value.operationId),
    generation: Number.isInteger(value.generation) && value.generation >= 0 ? value.generation : null,
    exitCode: Number.isInteger(value.exitCode) && value.exitCode >= 0 ? value.exitCode : null,
    exitSignal: safeExitSignal(value.exitSignal)
  };
}

function safeComponent(component, input = {}) {
  const managed = managedRuntimeComponents.has(component);
  const status = included(componentStatuses, input.status) ? input.status : "unknown";
  const health = included(componentHealths, input.health) ? input.health : "unknown";
  return {
    component,
    scope: runtimeComponentScopes[component],
    status,
    health,
    reasonCode: input.reasonCode === "diagnostics_retention_failed" && component !== "supervisor"
      ? null
      : diagnosticReasonCode(input.reasonCode),
    lastTransitionAt: timestamp(input.lastTransitionAt),
    generation: managed && Number.isInteger(input.generation) && input.generation >= 0 ? input.generation : null,
    restartCount: managed ? nonNegativeInteger(input.restartCount) : null,
    ownership: managed && included(ownershipStates, input.ownership) ? input.ownership : "not_applicable",
    lastFailure: safeFailure(input.lastFailure, component)
  };
}

function safeRecovery(value) {
  if (!value || typeof value !== "object") return null;
  const operationId = opaqueOperationId(value.operationId);
  const startedAt = timestamp(value.startedAt);
  if (!operationId || !startedAt || !included(recoveryOutcomes, value.outcome)) return null;
  return {
    operationId,
    startedAt,
    completedAt: timestamp(value.completedAt),
    outcome: value.outcome,
    generation: nonNegativeInteger(value.generation)
  };
}

/** Returns a v4 UUID generated by this module; callers must not encode host data in operation ids. */
export function createOpaqueOperationId() {
  return randomUUID();
}

/** Counts only a successful replacement child in the current Supervisor lifetime. */
export function nextRestartCount({ currentCount = 0, hasPriorSuccessfulStart = false, pid = null, intentionalShutdown = false } = {}) {
  const count = nonNegativeInteger(currentCount);
  return !intentionalShutdown && hasPriorSuccessfulStart && Number.isInteger(pid) && pid > 0 ? count + 1 : count;
}

/** Counts a Runtime-wide recovery operation once, regardless of affected components or outcome. */
export function nextRecoveryCount({ currentCount = 0, startsRecovery = false } = {}) {
  return nonNegativeInteger(currentCount) + (startsRecovery ? 1 : 0);
}

/**
 * Constructs the only Browser/API-safe diagnostics shape. It accepts only
 * pre-collected, read-only health results and never invokes a health endpoint.
 */
export function serializeRuntimeDiagnosticsSnapshot(input = {}, { capturedAt = new Date().toISOString() } = {}) {
  const captured = timestamp(capturedAt) ?? new Date().toISOString();
  const runtime = input.runtime && typeof input.runtime === "object" ? input.runtime : {};
  const componentValues = componentInputMap(input.components);
  return {
    schemaVersion: 1,
    snapshotVersion: Math.max(1, nonNegativeInteger(input.snapshotVersion, 1)),
    capturedAt: captured,
    supervisorStartedAt: timestamp(input.supervisorStartedAt) ?? captured,
    shell: runtime.shell === "ready" ? "ready" : "unavailable",
    status: included(runtimeStatuses, runtime.status) ? runtime.status : "unavailable",
    phase: included(runtimePhases, runtime.phase) ? runtime.phase : null,
    reasonCode: diagnosticReasonCode(runtime.reasonCode, { topLevel: true }),
    retryable: runtime.retryable === true,
    credentialStatus: included(credentialStatuses, runtime.credentialStatus) ? runtime.credentialStatus : "unknown",
    operationId: opaqueOperationId(runtime.operationId),
    generation: nonNegativeInteger(runtime.generation),
    lastTransitionAt: timestamp(input.lastTransitionAt),
    recoveryCount: nonNegativeInteger(input.recoveryCount),
    lastRecovery: safeRecovery(input.lastRecovery),
    components: runtimeComponents.map((component) => safeComponent(component, componentValues.get(component)))
  };
}

function canonicalInput(snapshot) {
  return {
    snapshotVersion: snapshot?.snapshotVersion,
    supervisorStartedAt: snapshot?.supervisorStartedAt,
    runtime: {
      shell: snapshot?.shell,
      status: snapshot?.status,
      phase: snapshot?.phase,
      reasonCode: snapshot?.reasonCode,
      retryable: snapshot?.retryable,
      credentialStatus: snapshot?.credentialStatus,
      operationId: snapshot?.operationId,
      generation: snapshot?.generation
    },
    lastTransitionAt: snapshot?.lastTransitionAt,
    recoveryCount: snapshot?.recoveryCount,
    lastRecovery: snapshot?.lastRecovery,
    components: snapshot?.components
  };
}

/** Accepts only an exact serializer output; malformed or expanded data fails closed. */
export function parseRuntimeDiagnosticsSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const canonical = serializeRuntimeDiagnosticsSnapshot(canonicalInput(snapshot), { capturedAt: snapshot.capturedAt });
  return JSON.stringify(canonical) === JSON.stringify(snapshot) ? canonical : null;
}

function reportValue(value, fallback = "N/A") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

/** Deterministic, human-readable report from an already canonical safe snapshot. */
export function createSafeDiagnosticReport(snapshot) {
  const value = parseRuntimeDiagnosticsSnapshot(snapshot);
  if (!value) throw new Error("Invalid runtime diagnostics snapshot.");
  const lines = [
    "UED Asset Hub Runtime Diagnostic Report",
    `Captured At: ${reportValue(value.capturedAt)}`,
    `Supervisor Started At: ${reportValue(value.supervisorStartedAt)}`,
    `Runtime Status: ${reportValue(value.status, "Unknown")}`,
    `Shell Status: ${reportValue(value.shell, "Unknown")}`,
    `Phase: ${reportValue(value.phase)}`,
    `Reason: ${reportValue(value.reasonCode)}`,
    `Retryable: ${value.retryable ? "Yes" : "No"}`,
    `Credential Status: ${reportValue(value.credentialStatus, "Unknown")}`,
    `Generation: ${reportValue(value.generation)}`,
    `Recovery Count: ${reportValue(value.recoveryCount)}`,
    "",
    "Components:"
  ];
  for (const component of value.components) {
    lines.push(`- ${component.component}: status=${reportValue(component.status, "Unknown")}; health=${reportValue(component.health, "Unknown")}; reason=${reportValue(component.reasonCode)}; transition=${reportValue(component.lastTransitionAt)}; generation=${reportValue(component.generation)}; restartCount=${reportValue(component.restartCount)}; ownership=${reportValue(component.ownership, "Unknown")}`);
    if (component.lastFailure) lines.push(`  lastFailure: reason=${reportValue(component.lastFailure.reasonCode)}; occurredAt=${reportValue(component.lastFailure.occurredAt)}; operation=${reportValue(component.lastFailure.operation)}; operationId=${reportValue(component.lastFailure.operationId)}; generation=${reportValue(component.lastFailure.generation)}; exitCode=${reportValue(component.lastFailure.exitCode)}; exitSignal=${reportValue(component.lastFailure.exitSignal)}`);
  }
  lines.push("", "Last Recovery:");
  if (value.lastRecovery) lines.push(`outcome=${value.lastRecovery.outcome}; startedAt=${value.lastRecovery.startedAt}; completedAt=${reportValue(value.lastRecovery.completedAt)}; generation=${value.lastRecovery.generation}; operationId=${value.lastRecovery.operationId}`);
  else lines.push("N/A");
  return lines.join("\n");
}
