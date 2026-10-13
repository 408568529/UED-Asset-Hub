import { randomUUID } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createManagedProcessPlatformAdapter } from "./managed-process-platform-adapter.mjs";

export class ManagedProcessController {
  constructor({ supervisorInstanceId, runtimeInstanceId = randomUUID(), metadataPath, onProcessEvent = () => {}, onPersistenceError = () => {}, spawnImpl, platform = process.platform, adapter, fileSystem = { writeFile, rename } } = {}) {
    this.supervisorInstanceId = supervisorInstanceId;
    this.runtimeInstanceId = runtimeInstanceId;
    this.metadataPath = metadataPath;
    this.onProcessEvent = onProcessEvent;
    this.onPersistenceError = onPersistenceError;
    this.platform = platform;
    this.adapter = adapter ?? createManagedProcessPlatformAdapter({ platform, spawnImpl });
    this.fileSystem = fileSystem;
    this.records = new Map();
    this.generations = new Map();
    this.specifications = new Map();
    this.restartTimers = new Map();
    this.shuttingDown = false;
    this.persistenceQueue = Promise.resolve();
  }

  snapshot() {
    return [...this.records.values()].map(({ child, exitPromise, exitPersistence, ...record }) => ({ ...record, running: record.managedState !== "exited" && Boolean(child && child.exitCode === null) }));
  }

  get(component) {
    return this.records.get(component);
  }

  async setMetadataPath(metadataPath) {
    this.metadataPath = metadataPath;
    await this.persistMetadata();
  }

  isRunning(component) {
    const record = this.records.get(component);
    return Boolean(record?.child && record.child.exitCode === null);
  }

  async persistMetadata() {
    if (!this.metadataPath) return;
    const payload = JSON.stringify({ version: 3, supervisorInstanceId: this.supervisorInstanceId, runtimeInstanceId: this.runtimeInstanceId, processes: this.snapshot() }, null, 2);
    const temporaryPath = `${this.metadataPath}.${randomUUID()}.next`;
    const persist = async () => {
      await this.fileSystem.writeFile(temporaryPath, payload, { mode: 0o600 });
      await this.fileSystem.rename(temporaryPath, this.metadataPath);
    };
    const task = this.persistenceQueue.then(persist, persist);
    this.persistenceQueue = task.catch((error) => { this.onPersistenceError(error); });
    return task;
  }

  async flushMetadata() {
    await this.persistenceQueue;
  }

  beginShutdown() {
    this.shuttingDown = true;
    this.cancelAllRestarts();
  }

  assertAllExited() {
    const active = [...this.records.values()].filter((record) => record.managedState !== "exited" && record.child?.exitCode === null);
    if (active.length > 0) throw new Error(`受管进程尚未全部退出：${active.map((record) => record.component).join(", ")}。`);
  }

  assertCurrentOwnership(record) {
    if (record.supervisorInstanceId !== this.supervisorInstanceId) throw new Error("受管进程 Supervisor ownership 不匹配；拒绝停止。 ");
    if (record.runtimeInstanceId !== this.runtimeInstanceId) throw new Error("受管进程 Runtime ownership 不匹配；拒绝停止。 ");
    if (this.generations.get(record.component) !== record.generation) throw new Error("受管进程 generation 不匹配；拒绝停止。 ");
  }

  async start(component, specification, { operation = "initial_start", operationId = null } = {}) {
    if (this.shuttingDown) throw new Error("Supervisor 正在停止，不能启动新进程。");
    if (this.isRunning(component)) return this.records.get(component);
    this.cancelRestart(component);
    this.specifications.set(component, specification);
    const previous = this.records.get(component);
    const generation = (previous?.generation ?? 0) + 1;
    let child;
    try {
      child = await this.adapter.spawn(specification, { component, supervisorInstanceId: this.supervisorInstanceId, runtimeInstanceId: this.runtimeInstanceId, generation });
    } catch (error) {
      this.onProcessEvent({ type: "start_failed", component, generation, intentional: false, operation, operationId, spawnFailed: true });
      throw error;
    }
    let resolveExit;
    const record = {
      component,
      generation,
      startedAt: new Date().toISOString(),
      supervisorInstanceId: this.supervisorInstanceId,
      runtimeInstanceId: this.runtimeInstanceId,
      platform: this.platform,
      pid: child.pid ?? null,
      ownershipCapability: "identity_capture_pending",
      jobOwnership: child.jobOwnership ?? null,
      graceful: { capability: this.platform === "win32" ? "named-pipe" : "signal", transport: this.platform === "win32" ? "local_named_pipe" : "process_group_signal", requestedAt: null, acknowledgedAt: null, completedAt: null, outcome: null, reasonCode: null },
      convergence: { rootExited: false, activeProcessCount: null, portsReleased: false, pipeClosed: this.platform !== "win32", verifiedAt: null },
      managedState: "running",
      child,
      exitPromise: new Promise((resolve) => { resolveExit = resolve; })
    };
    this.records.set(component, record);
    this.generations.set(component, generation);
    const emitExit = (reason) => {
      if (this.records.get(component) !== record || record.managedState === "exited") return;
      record.managedState = "exited";
      record.exitPersistence = Promise.resolve(this.persistMetadata()).catch(() => {});
      resolveExit?.();
      this.onProcessEvent({ type: "exit", component, generation, pid: record.pid, intentional: record.intentionalStop === true, operation, operationId, record: this.publicRecord(record), ...reason });
    };
    child.once("error", () => emitExit({ code: null, signal: null, spawnFailed: true }));
    child.once("exit", (code, signal) => emitExit({ code, signal }));
    const identity = await this.adapter.captureIdentity({ child, specification, supervisorInstanceId: this.supervisorInstanceId, runtimeInstanceId: this.runtimeInstanceId, generation }).catch(() => null);
    if (identity) Object.assign(record, identity);
    else record.ownershipCapability = "identity_capture_failed";
    await this.persistMetadata();
    if (record.managedState !== "exited" && Number.isInteger(record.pid) && record.pid > 0) {
      this.onProcessEvent({ type: "started", component, generation, pid: record.pid, intentional: false, ownership: "owned", operation, operationId, record: this.publicRecord(record) });
    }
    return record;
  }

  publicRecord({ child, exitPromise, exitPersistence, ...record }) {
    return { ...record, running: record.managedState !== "exited" && Boolean(child && child.exitCode === null) };
  }

  scheduleRestart(component, callback, delayMs) {
    if (this.shuttingDown || this.restartTimers.has(component)) return;
    const timer = setTimeout(() => {
      this.restartTimers.delete(component);
      if (!this.shuttingDown) void callback();
    }, delayMs);
    this.restartTimers.set(component, timer);
  }

  cancelRestart(component) {
    const timer = this.restartTimers.get(component);
    if (timer) clearTimeout(timer);
    this.restartTimers.delete(component);
  }

  cancelAllRestarts() {
    for (const component of this.restartTimers.keys()) this.cancelRestart(component);
  }

  async stop(component, { timeoutMs = 8_000, convergenceTimeoutMs = 8_000 } = {}) {
    this.cancelRestart(component);
    const record = this.records.get(component);
    if (!record?.child || record.child.exitCode !== null) return;
    if (record.managedState === "stopping") {
      await record.exitPromise;
      await record.exitPersistence;
      return;
    }
    this.assertCurrentOwnership(record);
    record.intentionalStop = true;
    record.managedState = "stopping";
    await this.persistMetadata().catch(() => {});
    this.onProcessEvent({ type: "stopping", component, generation: record.generation, pid: record.pid, intentional: true, ownership: "owned", operation: "shutdown", record: this.publicRecord(record) });
    record.graceful.requestedAt = new Date().toISOString();
    const graceful = await this.adapter.requestGracefulShutdown(record, specificationFor(record, this.specifications)).catch((error) => ({ acknowledged: false, reasonCode: error instanceof Error ? error.message : "graceful_shutdown_failed" }));
    record.graceful.acknowledgedAt = graceful.acknowledged ? new Date().toISOString() : null;
    record.graceful.outcome = graceful.acknowledged ? "accepted" : "unavailable";
    record.graceful.reasonCode = graceful.reasonCode ?? null;
    if (!graceful.acknowledged) this.onProcessEvent({ type: "graceful_shutdown_failed", component, generation: record.generation, pid: record.pid, intentional: true, ownership: "owned", operation: "shutdown", record: this.publicRecord(record), reasonCode: graceful.reasonCode ?? "graceful_shutdown_failed" });
    const exited = await this.adapter.waitForExit(record, graceful.acknowledged ? timeoutMs : 0);
    if (!exited && this.records.get(component) === record) {
      record.graceful.outcome = "timed_out_forced";
      await this.adapter.forceTerminate(record);
      const forcedExit = await this.adapter.waitForExit(record, 2_000);
      if (!forcedExit) throw new Error(`已确认归属的 ${component} 进程未在强制停止后退出。`);
    }
    await record.exitPersistence;
    record.graceful.completedAt = new Date().toISOString();
    record.convergence.rootExited = true;
    const convergenceDeadline = Date.now() + convergenceTimeoutMs;
    record.convergence.deadlineAt = new Date(convergenceDeadline).toISOString();
    try {
      await this.adapter.verifyConvergence(record, specificationFor(record, this.specifications), { deadlineAt: convergenceDeadline });
    } catch (error) {
      if (error?.reasonCode === "windows_job_not_empty" && typeof this.adapter.safeFallbackAfterJobNotEmpty === "function") {
        try {
          const fallback = await this.adapter.safeFallbackAfterJobNotEmpty(record, specificationFor(record, this.specifications), { timeoutMs: convergenceTimeoutMs });
          record.convergence.activeProcessCount = fallback.activeProcessCountAfter;
          record.convergence.portsReleased = fallback.portsReleased === true;
          record.convergence.pipeClosed = true;
          record.convergence.verifiedAt = fallback.completedAt;
          await this.persistMetadata();
          this.onProcessEvent({ type: "safe_fallback_completed", component, generation: record.generation, pid: record.pid, intentional: true, ownership: "strong", operation: "shutdown", reasonCode: fallback.reasonCode, record: this.publicRecord(record) });
        } catch (fallbackError) {
          record.convergence.failedAt = new Date().toISOString();
          const fallbackReasonCode = fallbackError?.reasonCode ?? error?.reasonCode ?? "owned_job_fallback_failed";
          if (record.convergence.fallback?.outcome === "running") {
            record.convergence.fallback.outcome = "failed";
            record.convergence.fallback.failureReasonCode = fallbackReasonCode;
          }
          record.convergence.failureReasonCode = fallbackReasonCode;
          await this.persistMetadata().catch(() => {});
          this.onProcessEvent({ type: "safe_fallback_failed", component, generation: record.generation, pid: record.pid, intentional: true, ownership: "strong", operation: "shutdown", reasonCode: record.convergence.failureReasonCode, record: this.publicRecord(record) });
          throw fallbackError;
        }
      } else {
        record.convergence.failedAt = new Date().toISOString();
        record.convergence.failureReasonCode = error?.reasonCode ?? "managed_process_convergence_failed";
        if (typeof error?.reasonCode === "string" && error.reasonCode.startsWith("windows_job_")) {
          record.convergence.jobQueryFailure ??= { reasonCode: error.reasonCode };
        }
        await this.persistMetadata().catch(() => {});
        this.onProcessEvent({
          type: "convergence_failed",
          component,
          generation: record.generation,
          pid: record.pid,
          code: record.child.exitCode,
          signal: record.child.signalCode,
          activeProcessCount: record.convergence.activeProcessCount,
          deadlineAt: record.convergence.deadlineAt,
          reasonCode: record.convergence.failureReasonCode
        });
        throw error;
      }
    }
    record.convergence.portsReleased = true;
    record.convergence.pipeClosed = true;
    record.convergence.verifiedAt ??= new Date().toISOString();
    await this.persistMetadata();
    await this.adapter.cleanup(record);
    if (record.jobOwnership) await this.persistMetadata();
  }

  async stopAll(components, specifications = {}) {
    this.beginShutdown();
    for (const [component, specification] of Object.entries(specifications)) this.specifications.set(component, specification);
    for (const component of components) await this.stop(component);
    await this.persistMetadata();
    await this.flushMetadata();
  }
}

function specificationFor(record, specifications) {
  return specifications?.get?.(record.component) ?? specifications?.[record.component] ?? {};
}

export function managedMetadataPath(runtimeDirectories) {
  return path.join(runtimeDirectories.supervisor, "managed-processes.json");
}

export async function assertNoLiveManagedOrphans(metadataPath, { adapter = createManagedProcessPlatformAdapter() } = {}) {
  const metadata = await readFile(metadataPath, "utf8").then(JSON.parse).catch(() => null);
  const live = [];
  for (const record of metadata?.processes ?? []) {
    if (record?.managedState === "exited") continue;
    const inspection = await adapter.inspectStoredProcess(record);
    if (inspection.alive) live.push({ record, inspection });
  }
  if (live.length > 0) throw new Error(`发现上一个 Supervisor 实例遗留的受管进程：${live.map(({ record }) => record.component).join(", ")}。拒绝接管或终止，需先由原 Supervisor 或运维确认处理。`);
}
