import { randomUUID } from "node:crypto";

const terminalStates = new Set(["ready", "unavailable", "configuration_required", "error"]);

function safeError(error) {
  return error instanceof Error ? error.message : "Runtime operation failed.";
}

export class RuntimeLifecycleCore {
  constructor({ controller, inspectStatic, inspectRuntime, prepareRuntime, startComponent, stopComponents, onStateChange = () => {} }) {
    this.controller = controller;
    this.inspectStatic = inspectStatic;
    this.inspectRuntime = inspectRuntime;
    this.prepareRuntime = prepareRuntime;
    this.startComponent = startComponent;
    this.stopComponents = stopComponents;
    this.onStateChange = onStateChange;
    this.state = { status: "unavailable", phase: null, reasonCode: null, operationId: null, startedAt: null, generation: 0, credentialStatus: "unknown", shell: "ready" };
    this.operation = null;
    this.shuttingDown = false;
  }

  snapshot() {
    return { ...this.state, operation: this.operation ? { operationId: this.operation.operationId, startedAt: this.operation.startedAt, phase: this.state.phase, generation: this.operation.generation } : null };
  }

  transition(status, { phase = null, reasonCode = null, credentialStatus = this.state.credentialStatus } = {}) {
    this.state = { ...this.state, status, phase, reasonCode, credentialStatus };
    this.onStateChange(this.snapshot());
    return this.snapshot();
  }

  async inspect() {
    const staticResult = await this.inspectStatic();
    if (!staticResult.ok) return this.transition("configuration_required", { reasonCode: staticResult.reasonCode, credentialStatus: "unknown" });
    const runtime = await this.inspectRuntime();
    if (!runtime.dsh) return this.transition("unavailable", { credentialStatus: "unknown" });
    if (!runtime.gateway || !runtime.proxy || !runtime.mcp) return this.transition("error", { reasonCode: runtime.reasonCode || "runtime_health_failed", credentialStatus: "unknown" });
    if (runtime.credentialStatus === "missing") return this.transition("configuration_required", { reasonCode: "credential_missing", credentialStatus: "missing" });
    if (runtime.credentialStatus !== "configured") return this.transition("error", { reasonCode: "credential_status_unknown", credentialStatus: "unknown" });
    return this.transition("ready", { credentialStatus: "configured" });
  }

  async ensureReady({ recovering = false } = {}) {
    if (this.shuttingDown) return this.snapshot();
    if (this.state.status === "ready") return this.snapshot();
    if (this.operation) return this.operation.promise;
    const operation = { operationId: randomUUID(), startedAt: new Date().toISOString(), generation: this.state.generation + 1, promise: null };
    this.operation = operation;
    this.state = { ...this.state, operationId: operation.operationId, startedAt: operation.startedAt, generation: operation.generation };
    operation.promise = this.runStart(operation, { recovering }).finally(() => {
      if (this.operation === operation) this.operation = null;
    });
    return operation.promise;
  }

  async runStart(operation, { recovering }) {
    try {
      if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: recovering ? "recovering" : "preflight", credentialStatus: "unknown" });
      const staticResult = await this.inspectStatic();
      if (this.shuttingDown) return this.snapshot();
      if (!staticResult.ok) return this.transition("configuration_required", { reasonCode: staticResult.reasonCode, credentialStatus: "unknown" });
      this.transition("starting", { phase: "initializing-runtime-dir", credentialStatus: "unknown" });
      await this.prepareRuntime();
      if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: "starting-gateway", credentialStatus: "unknown" });
      await this.startComponent("gateway");
      if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: "starting-dsh", credentialStatus: "unknown" });
      await this.startComponent("dsh");
      if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: "starting-proxy", credentialStatus: "unknown" });
      await this.startComponent("proxy");
      if (this.shuttingDown) return this.snapshot();
      this.transition("starting", { phase: "health-check", credentialStatus: "unknown" });
      const runtime = await this.inspectRuntime();
      if (!runtime.dsh || !runtime.gateway || !runtime.proxy || !runtime.mcp) {
        return this.transition("error", { reasonCode: runtime.reasonCode || "runtime_health_failed", credentialStatus: "unknown" });
      }
      if (runtime.credentialStatus === "missing") return this.transition("configuration_required", { reasonCode: "credential_missing", credentialStatus: "missing" });
      if (runtime.credentialStatus !== "configured") return this.transition("error", { reasonCode: "credential_status_unknown", credentialStatus: "unknown" });
      return this.transition("ready", { credentialStatus: "configured" });
    } catch (error) {
      return this.transition("error", { reasonCode: "runtime_start_failed", credentialStatus: "unknown", message: safeError(error) });
    }
  }

  async stopAgentRuntime() {
    this.state = { ...this.state, generation: this.state.generation + 1 };
    await this.stopComponents();
    return this.transition("unavailable", { credentialStatus: "unknown" });
  }

  async stopForShutdown() {
    this.shuttingDown = true;
    const activeOperation = this.operation?.promise;
    if (activeOperation) await activeOperation.catch(() => {});
    this.state = { ...this.state, generation: this.state.generation + 1 };
    await this.stopComponents();
  }

  async handleProcessExit(event) {
    if (this.shuttingDown || event.intentional || event.generation !== this.controller.get(event.component)?.generation) return;
    if (!new Set(["gateway", "dsh", "proxy"]).has(event.component)) return;
    this.transition("starting", { phase: "recovering", reasonCode: null, credentialStatus: "unknown" });
    if (event.component === "gateway") await this.stopComponents(["proxy", "dsh"]);
    await this.ensureReady({ recovering: true });
  }

  isTerminal() {
    return terminalStates.has(this.state.status);
  }
}
