export type RuntimeComponent = "supervisor" | "publicEdge" | "assetHubInternal" | "runtimeControl" | "gateway" | "dsh" | "proxy";
export type RuntimeDiagnosticsReasonCode =
  | "runtime_configuration_invalid" | "source_invalid" | "build_missing" | "build_invalid" | "port_conflict"
  | "runtime_ownership_conflict" | "runtime_lock_conflict" | "orphan_processes_detected" | "dsh_unavailable"
  | "runtime_health_failed" | "runtime_degraded" | "runtime_start_failed" | "recovery_failed"
  | "agent_configuration_invalid" | "credential_missing" | "credential_status_unknown"
  | "runtime_control_unavailable" | "metadata_persistence_failed" | "process_start_failed"
  | "process_exited" | "health_check_failed" | "restart_failed" | "shutdown_failed"
  | "runtime_control_failed" | "diagnostics_retention_failed" | "runtime_unknown_failure";
export type ComponentStatus = "unknown" | "not_started" | "starting" | "running" | "stopping" | "stopped" | "exited" | "failed";
export type ComponentHealth = "unknown" | "healthy" | "unhealthy" | "not_applicable";
export type ProcessOwnership = "owned" | "not_owned" | "unknown" | "not_applicable";
export type FailureOperation = "initial_start" | "manual_start" | "process_restart" | "runtime_recovery" | "health_check" | "metadata_persistence" | "retention" | "shutdown";
export type ExitSignal = "SIGTERM" | "SIGKILL" | "SIGINT" | "SIGHUP" | "SIGABRT" | "SIGSEGV" | "SIGBUS" | "SIGILL" | "SIGFPE" | "SIGQUIT" | "unknown";
export type FailureProvenance = { reasonCode: RuntimeDiagnosticsReasonCode; occurredAt: string; operation: FailureOperation; operationId: string | null; generation: number | null; exitCode: number | null; exitSignal: ExitSignal | null };
export type ComponentDiagnostics = { component: RuntimeComponent; scope: "shell" | "runtime_infrastructure" | "agent_runtime"; status: ComponentStatus; health: ComponentHealth; reasonCode: RuntimeDiagnosticsReasonCode | null; lastTransitionAt: string | null; generation: number | null; restartCount: number | null; ownership: ProcessOwnership; lastFailure: FailureProvenance | null };
export type RuntimeDiagnosticsSnapshot = { schemaVersion: 1; snapshotVersion: number; capturedAt: string; supervisorStartedAt: string; shell: "ready" | "unavailable"; status: "unavailable" | "starting" | "ready" | "configuration_required" | "error"; phase: "preflight" | "initializing-runtime-dir" | "starting-gateway" | "starting-dsh" | "starting-proxy" | "health-check" | "recovering" | null; reasonCode: RuntimeDiagnosticsReasonCode | null; retryable: boolean; credentialStatus: "configured" | "missing" | "unknown"; operationId: string | null; generation: number; lastTransitionAt: string | null; recoveryCount: number; lastRecovery: { operationId: string; startedAt: string; completedAt: string | null; outcome: "in_progress" | "succeeded" | "failed"; generation: number } | null; components: ComponentDiagnostics[] };
export const runtimeComponents: readonly RuntimeComponent[];
export const managedRuntimeComponents: ReadonlySet<RuntimeComponent>;
export function createOpaqueOperationId(): string;
export function nextRestartCount(input?: { currentCount?: number; hasPriorSuccessfulStart?: boolean; pid?: number | null; intentionalShutdown?: boolean }): number;
export function nextRecoveryCount(input?: { currentCount?: number; startsRecovery?: boolean }): number;
export function serializeRuntimeDiagnosticsSnapshot(input?: unknown, options?: { capturedAt?: string }): RuntimeDiagnosticsSnapshot;
export function parseRuntimeDiagnosticsSnapshot(snapshot: unknown): RuntimeDiagnosticsSnapshot | null;
export function createSafeDiagnosticReport(snapshot: RuntimeDiagnosticsSnapshot): string;
