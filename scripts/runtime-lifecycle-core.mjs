import { randomUUID } from "node:crypto";

const terminalStates = new Set(["ready", "unavailable", "configuration_required", "error"]);

function safeError(error) {
  return error instanceof Error ? error.message : "Runtime operation failed.";
}

function lifecycleFailure(error, { recovering }) {
  const details = error && typeof error === "object" ? error : null;
  const reasonCode = details?.reasonCode;
  const retryable = details?.retryable === true;
  if (reasonCode && !retryable) return { reasonCode, retryable: false };
  return { reasonCode: recovering ? "recovery_failed" : reasonCode || "runtime_start_failed", retryable };
}

export class RuntimeLifecycleCore {
  constructor({ controller, inspectStatic, inspectRuntime, prepareRuntime, startComponent, stopComponents, onStateChange = () => {}, onRecoveryEvent = () => {} }) {
    this.controller = controller;
    this.inspectStatic = inspectStatic;
    this.inspectRuntime = inspectRuntime;
    this.prepareRuntime = prepareRuntime;
    this.startComponent = startComponent;
    this.stopComponents = stopComponents;
    this.onStateChange = onStateChange;
    this.onRecoveryEvent = onRecoveryEvent;
    this.state = { status: "unavailable", phase: null, reasonCode: null, operationId: null, startedAt: null, generation: 0, credentialStatus: "unknown", retryable: false, shell: "ready" };
    this.operation = null;
    this.shuttingDown = false;
  }

  snapshot() {
    return { ...this.state, operation: this.operation ? { operationId: this.operation.operationId, startedAt: this.operation.startedAt, phase: this.state.phase, generation: this.operation.generation } : null };
  }

  transition(status, { phase = null, reasonCode = null, credentialStatus = this.state.credentialStatus, retryable = false } = {}) {
    this.state = { ...this.state, status, phase, reasonCode, credentialStatus, retryable: (status === "error" || status === "unavailable") && retryable === true };
    this.onStateChange(this.snapshot());
    return this.snapshot();
  }

  async observeRuntime() {
    const staticResult = await this.inspectStatic();
    if (!staticResult.ok) return { state: { status: "configuration_required", reasonCode: staticResult.reasonCode, credentialStatus: "unknown", retryable: false }, runtime: null };
    const runtime = await this.inspectRuntime();
    if (!runtime.dsh) return { state: { status: "unavailable", reasonCode: "dsh_unavailable", credentialStatus: "unknown", retryable: false }, runtime };
    if (!runtime.gateway || !runtime.proxy || !runtime.mcp) return { state: { status: "error", reasonCode: runtime.reasonCode || "runtime_health_failed", credentialStatus: "unknown", retryable: true }, runtime };
    if (runtime.agentConfigurationStatus === "invalid") return { state: { status: "configuration_required", reasonCode: "agent_configuration_invalid", credentialStatus: "unknown", retryable: false }, runtime };
    if (runtime.credentialStatus === "missing") return { state: { status: "configuration_required", reasonCode: "credential_missing", credentialStatus: "missing", retryable: false }, runtime };
    if (runtime.credentialStatus !== "configured") return { state: { status: "error", reasonCode: "credential_status_unknown", credentialStatus: "unknown", retryable: false }, runtime };
    return { state: { status: "ready", reasonCode: null, credentialStatus: "configured", retryable: false }, runtime };
  }

  effectiveObservedState(observed) {
    if (observed.status === "ready" || observed.status === "configuration_required") return observed;
    if (this.state.status === "error") return { status: "error", reasonCode: this.state.reasonCode, credentialStatus: observed.credentialStatus, retryable: this.state.retryable };
    if (this.state.status === "ready") return { status: "error", reasonCode: "runtime_degraded", credentialStatus: observed.credentialStatus, retryable: true };
    if (this.state.status === "configuration_required" && observed.status === "unavailable") return { ...observed, retryable: true };
    return observed;
  }

  async inspect({ readOnly = false } = {}) {
    if (this.shuttingDown) return this.snapshot();
    if (readOnly && this.operation) return this.snapshot();
    const report = (status, options = {}) => readOnly
      ? { ...this.state, status, phase: options.phase ?? null, reasonCode: options.reasonCode ?? null, credentialStatus: options.credentialStatus ?? this.state.credentialStatus, retryable: options.retryable === true, operation: this.operation ? { operationId: this.operation.operationId, startedAt: this.operation.startedAt, phase: this.state.phase, generation: this.operation.generation } : null }
      : this.transition(status, options);
    const observation = await this.observeRuntime();
    const state = this.effectiveObservedState(observation.state);
    return report(state.status, state);
  }

  emitRecovery(event) {
    try { this.onRecoveryEvent(event); } catch { /* Diagnostics must not alter lifecycle behavior. */ }
  }

  startRecovery(operation) {
    if (this.shuttingDown || operation.recoveryStarted) return false;
    operation.recoveryStarted = true;
    this.emitRecovery({ type: "started", operationId: operation.operationId, startedAt: operation.startedAt, generation: operation.generation });
    return true;
  }

  completeRecovery(operation) {
    if (!operation.recoveryStarted) return;
    this.emitRecovery({ type: "completed", operationId: operation.operationId, completedAt: new Date().toISOString(), outcome: this.state.status === "ready" ? "succeeded" : "failed", generation: operation.generation });
  }

  async ensureReady({ recovering = false, trigger = "manual_start" } = {}) {
    if (this.shuttingDown) return this.snapshot();
    if (this.operation) return this.operation.promise;
    const previous = { status: this.state.status, reasonCode: this.state.reasonCode, retryable: this.state.retryable };
    const operation = { operationId: randomUUID(), startedAt: new Date().toISOString(), generation: this.state.generation + 1, trigger, recoveryStarted: false, promise: null };
    this.operation = operation;
    this.state = { ...this.state, operationId: operation.operationId, startedAt: operation.startedAt, generation: operation.generation };
    if (recovering) this.transition("starting", { phase: "recovering", reasonCode: null, credentialStatus: "unknown" });
    operation.promise = this.runEnsure(operation, { recovering, previous }).finally(() => {
      this.completeRecovery(operation);
      if (this.operation === operation) this.operation = null;
    });
    return operation.promise;
  }

  async runEnsure(operation, { recovering, previous }) {
    try {
      if (this.shuttingDown) return this.snapshot();
      const requiresHealthConfirmation = !recovering && (previous.status === "ready" || (previous.status === "error" && previous.retryable));
      const recoveryAttempt = recovering || previous.status === "ready" || previous.reasonCode === "recovery_failed";
      if (recovering) this.startRecovery(operation);
      if (requiresHealthConfirmation) {
        this.transition("starting", { phase: "health-check", credentialStatus: "unknown" });
        const observation = await this.observeRuntime();
        if (this.shuttingDown) return this.snapshot();
        if (observation.state.status === "ready") return this.transition("ready", observation.state);
        if (observation.state.status === "configuration_required") return this.transition("configuration_required", observation.state);
        if (observation.state.reasonCode === "credential_status_unknown") return this.transition("error", observation.state);
        this.startRecovery(operation);
        await this.recoverUnhealthyRuntime(observation.runtime);
        if (this.shuttingDown) return this.snapshot();
      }
      return await this.runStart(operation, { recovering: recoveryAttempt });
    } catch (error) {
      const failure = lifecycleFailure(error, { recovering: recovering || previous.status === "ready" || previous.reasonCode === "recovery_failed" });
      return this.transition("error", { ...failure, credentialStatus: "unknown" });
    }
  }

  async recoverUnhealthyRuntime(runtime) {
    if (!runtime) return;
    if (!runtime.gateway || !runtime.mcp) {
      await this.stopComponents(["proxy", "dsh", "gateway"]);
      return;
    }
    if (!runtime.dsh) {
      await this.stopComponents(["proxy", "dsh"]);
      return;
    }
    if (!runtime.proxy) await this.stopComponents(["proxy"]);
  }

  async start(component, operation) {
    try {
      await this.startComponent(component, operation);
    } catch (error) {
      if (error && typeof error === "object" && "reasonCode" in error) throw error;
      const wrapped = error instanceof Error ? error : new Error(safeError(error));
      wrapped.retryable = true;
      throw wrapped;
    }
  }

  async runStart(operation, { recovering }) {
    if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: recovering ? "recovering" : "preflight", credentialStatus: "unknown" });
      const staticResult = await this.inspectStatic();
      if (this.shuttingDown) return this.snapshot();
      if (!staticResult.ok) return this.transition("configuration_required", { reasonCode: staticResult.reasonCode, credentialStatus: "unknown" });
      this.transition("starting", { phase: "initializing-runtime-dir", credentialStatus: "unknown" });
      await this.prepareRuntime();
      if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: "starting-gateway", credentialStatus: "unknown" });
      await this.start("gateway", operation);
      if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: "starting-dsh", credentialStatus: "unknown" });
      await this.start("dsh", operation);
      if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: "starting-proxy", credentialStatus: "unknown" });
      await this.start("proxy", operation);
      if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: "health-check", credentialStatus: "unknown" });
      const runtime = await this.inspectRuntime();
      if (!runtime.dsh || !runtime.gateway || !runtime.proxy || !runtime.mcp) {
        return this.transition("error", { reasonCode: recovering ? "recovery_failed" : runtime.reasonCode || "runtime_health_failed", credentialStatus: "unknown", retryable: true });
      }
      if (runtime.agentConfigurationStatus === "invalid") return this.transition("configuration_required", { reasonCode: "agent_configuration_invalid", credentialStatus: "unknown" });
      if (runtime.credentialStatus === "missing") return this.transition("configuration_required", { reasonCode: "credential_missing", credentialStatus: "missing" });
      if (runtime.credentialStatus !== "configured") return this.transition("error", { reasonCode: "credential_status_unknown", credentialStatus: "unknown" });
      return this.transition("ready", { credentialStatus: "configured" });
  }

  async stopAgentRuntime() {
    this.state = { ...this.state, generation: this.state.generation + 1 };
    await this.stopComponents();
    return this.transition("unavailable", { credentialStatus: "unknown" });
  }

  async stopForShutdown() {
    this.shuttingDown = true;
    this.transition("shutting_down", { phase: "stopping", credentialStatus: "unknown" });
    const activeOperation = this.operation?.promise;
    if (activeOperation) await activeOperation.catch(() => {});
    this.state = { ...this.state, generation: this.state.generation + 1 };
    await this.stopComponents();
  }

  async handleProcessExit(event) {
    if (this.shuttingDown || event.intentional || event.generation !== this.controller.get(event.component)?.generation) return;
    if (!new Set(["gateway", "dsh", "proxy"]).has(event.component)) return;
    if (event.component === "gateway") await this.stopComponents(["proxy", "dsh"]);
    await this.ensureReady({ recovering: true, trigger: "runtime_recovery" });
  }

  isTerminal() {
    return terminalStates.has(this.state.status);
  }
}
