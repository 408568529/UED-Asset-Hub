import {
  nextRecoveryCount,
  nextRestartCount,
  runtimeComponents,
  serializeRuntimeDiagnosticsSnapshot
} from "./runtime-diagnostics-contract.mjs";

const managedComponentMapping = Object.freeze({ assetHub: "assetHubInternal", gateway: "gateway", dsh: "dsh", proxy: "proxy" });
const managedComponents = new Set(Object.values(managedComponentMapping));
const opaqueOperationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function timestamp(now) {
  return now();
}

function safeGeneration(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function safeOperation(value, fallback) {
  return typeof value === "string" ? value : fallback;
}

function initialComponent(component) {
  return {
    component,
    status: "unknown",
    health: "unknown",
    reasonCode: null,
    lastTransitionAt: null,
    generation: null,
    restartCount: managedComponents.has(component) ? 0 : null,
    ownership: managedComponents.has(component) ? "unknown" : "not_applicable",
    lastFailure: null,
    transitionRevision: 0,
    hasPriorSuccessfulStart: false
  };
}

export function diagnosticsComponentForManagedKey(component) {
  return managedComponentMapping[component] ?? null;
}

export class RuntimeDiagnosticsState {
  constructor({ now = () => new Date().toISOString(), supervisorStartedAt = now() } = {}) {
    this.now = now;
    this.supervisorStartedAt = supervisorStartedAt;
    this.snapshotVersion = 1;
    this.shuttingDown = false;
    this.runtime = { shell: "ready", status: "unavailable", phase: null, reasonCode: null, retryable: false, credentialStatus: "unknown", operationId: null, generation: 0 };
    this.lastTransitionAt = null;
    this.recoveryCount = 0;
    this.lastRecovery = null;
    this.components = new Map(runtimeComponents.map((component) => [component, initialComponent(component)]));
  }

  component(component) {
    return this.components.get(component) ?? null;
  }

  mutateComponent(component, mutate, { allowDuringShutdown = true } = {}) {
    const current = this.component(component);
    if (!current || (this.shuttingDown && !allowDuringShutdown)) return false;
    const next = mutate({ ...current });
    if (!next || same(current, next)) return false;
    next.transitionRevision = current.transitionRevision + 1;
    this.components.set(component, next);
    this.snapshotVersion += 1;
    return true;
  }

  recordRuntimeState(state) {
    const next = {
      shell: state?.shell === "ready" ? "ready" : "unavailable",
      status: state?.status,
      phase: state?.phase ?? null,
      reasonCode: state?.reasonCode ?? null,
      retryable: state?.retryable === true,
      credentialStatus: state?.credentialStatus,
      operationId: state?.operationId ?? null,
      generation: Number.isInteger(state?.generation) ? state.generation : 0
    };
    if (same(this.runtime, next)) return false;
    this.runtime = next;
    this.lastTransitionAt = timestamp(this.now);
    this.snapshotVersion += 1;
    return true;
  }

  recordInProcessLifecycle(component, { status, health = "unknown", reasonCode = null } = {}) {
    return this.mutateComponent(component, (current) => ({ ...current, status, health, reasonCode, lastTransitionAt: timestamp(this.now) }));
  }

  recordManagedEvent(event) {
    const component = diagnosticsComponentForManagedKey(event?.component);
    if (!component) return false;
    const generation = safeGeneration(event.generation);
    const operation = safeOperation(event.operation, "initial_start");
    if (event.type === "start_failed") {
      return this.mutateComponent(component, (current) => ({
        ...current,
        status: "failed",
        health: "unknown",
        reasonCode: "process_start_failed",
        lastTransitionAt: timestamp(this.now),
        generation,
        ownership: "unknown",
        lastFailure: { reasonCode: "process_start_failed", occurredAt: timestamp(this.now), operation, operationId: event.operationId ?? null, generation, exitCode: null, exitSignal: null }
      }), { allowDuringShutdown: false });
    }
    if (event.type === "started") {
      return this.mutateComponent(component, (current) => ({
        ...current,
        status: "running",
        health: "unknown",
        reasonCode: null,
        lastTransitionAt: timestamp(this.now),
        generation,
        restartCount: nextRestartCount({ currentCount: current.restartCount ?? 0, hasPriorSuccessfulStart: current.hasPriorSuccessfulStart, pid: event.pid, intentionalShutdown: this.shuttingDown }),
        ownership: event.ownership === "owned" ? "owned" : "unknown",
        hasPriorSuccessfulStart: current.hasPriorSuccessfulStart || (Number.isInteger(event.pid) && event.pid > 0)
      }), { allowDuringShutdown: false });
    }
    if (event.type === "stopping") {
      return this.mutateComponent(component, (current) => ({ ...current, status: "stopping", health: "unknown", reasonCode: null, lastTransitionAt: timestamp(this.now), generation, ownership: event.ownership === "owned" ? "owned" : "unknown" }));
    }
    if (event.type === "exit") {
      return this.mutateComponent(component, (current) => {
        const intentional = event.intentional === true;
        const reasonCode = intentional ? null : event.spawnFailed === true ? "process_start_failed" : "process_exited";
        return {
          ...current,
          status: intentional ? "stopped" : "exited",
          health: "unknown",
          reasonCode,
          lastTransitionAt: timestamp(this.now),
          generation,
          ownership: "unknown",
          lastFailure: intentional ? current.lastFailure : {
            reasonCode,
            occurredAt: timestamp(this.now),
            operation: event.spawnFailed === true ? operation : "process_restart",
            operationId: event.operationId ?? null,
            generation,
            exitCode: Number.isInteger(event.code) && event.code >= 0 ? event.code : null,
            exitSignal: event.signal ?? null
          }
        };
      });
    }
    return false;
  }

  beginHealthProbe(component) {
    const current = this.component(component);
    if (!current) return null;
    return { component, generation: current.generation, transitionRevision: current.transitionRevision };
  }

  acceptHealthProbe(token, { health, reasonCode = null, operation = "health_check", operationId = null } = {}) {
    const current = token && this.component(token.component);
    if (!current || current.generation !== token.generation || current.transitionRevision !== token.transitionRevision) return false;
    if (this.shuttingDown && health === "healthy") return false;
    return this.mutateComponent(token.component, (component) => ({
      ...component,
      health: health === "healthy" || health === "unhealthy" ? health : "unknown",
      reasonCode: health === "unhealthy" ? reasonCode || "health_check_failed" : component.reasonCode,
      lastFailure: health === "unhealthy"
        ? { reasonCode: reasonCode || "health_check_failed", occurredAt: timestamp(this.now), operation, operationId, generation: component.generation, exitCode: null, exitSignal: null }
        : component.lastFailure
    }));
  }

  recordOwnership(component, ownership) {
    if (!managedComponents.has(component)) return false;
    return this.mutateComponent(component, (current) => ({ ...current, ownership: ["owned", "not_owned", "unknown"].includes(ownership) ? ownership : "unknown" }));
  }

  recordRecovery(event) {
    if (!event || !["started", "completed"].includes(event.type)) return false;
    if (event.type === "started") {
      if (!opaqueOperationIdPattern.test(event.operationId ?? "") || typeof event.startedAt !== "string") return false;
      if (this.shuttingDown || this.lastRecovery?.operationId === event.operationId) return false;
      this.recoveryCount = nextRecoveryCount({ currentCount: this.recoveryCount, startsRecovery: true });
      this.lastRecovery = { operationId: event.operationId, startedAt: event.startedAt, completedAt: null, outcome: "in_progress", generation: Number.isInteger(event.generation) ? event.generation : 0 };
      this.snapshotVersion += 1;
      return true;
    }
    if (!this.lastRecovery || this.lastRecovery.operationId !== event.operationId || this.lastRecovery.outcome !== "in_progress") return false;
    this.lastRecovery = { ...this.lastRecovery, completedAt: event.completedAt ?? timestamp(this.now), outcome: event.outcome === "succeeded" ? "succeeded" : "failed" };
    this.snapshotVersion += 1;
    return true;
  }

  recordSupervisorDegradation(reasonCode) {
    if (!["diagnostics_retention_failed", "metadata_persistence_failed"].includes(reasonCode)) return false;
    return this.mutateComponent("supervisor", (current) => ({ ...current, status: current.status === "stopped" ? "stopped" : "running", health: "unhealthy", reasonCode, lastTransitionAt: timestamp(this.now) }));
  }

  clearSupervisorDegradation(reasonCode) {
    const current = this.component("supervisor");
    if (!current || current.reasonCode !== reasonCode) return false;
    return this.mutateComponent("supervisor", (value) => ({ ...value, status: value.status === "stopped" ? "stopped" : "running", health: "healthy", reasonCode: null, lastTransitionAt: timestamp(this.now) }));
  }

  beginShutdown() {
    if (this.shuttingDown) return false;
    this.shuttingDown = true;
    let changed = false;
    for (const component of runtimeComponents) {
      const current = this.component(component);
      if (current?.health === "healthy") changed = this.mutateComponent(component, (value) => ({ ...value, health: "unknown" })) || changed;
    }
    return changed;
  }

  snapshot({ capturedAt = timestamp(this.now) } = {}) {
    return serializeRuntimeDiagnosticsSnapshot({
      snapshotVersion: this.snapshotVersion,
      supervisorStartedAt: this.supervisorStartedAt,
      runtime: this.runtime,
      lastTransitionAt: this.lastTransitionAt,
      recoveryCount: this.recoveryCount,
      lastRecovery: this.lastRecovery,
      components: runtimeComponents.map((component) => this.component(component))
    }, { capturedAt });
  }
}

export function createRuntimeDiagnosticsState(options) {
  return new RuntimeDiagnosticsState(options);
}
