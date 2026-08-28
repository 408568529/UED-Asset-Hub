import { spawn } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class ManagedProcessController {
  constructor({ supervisorInstanceId, metadataPath, onProcessEvent = () => {}, spawnImpl = spawn, platform = process.platform } = {}) {
    this.supervisorInstanceId = supervisorInstanceId;
    this.metadataPath = metadataPath;
    this.onProcessEvent = onProcessEvent;
    this.spawnImpl = spawnImpl;
    this.platform = platform;
    this.records = new Map();
    this.restartTimers = new Map();
    this.shuttingDown = false;
  }

  snapshot() {
    return [...this.records.values()].map(({ child, exitPromise, ...record }) => ({ ...record, running: Boolean(child && child.exitCode === null) }));
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
    const payload = JSON.stringify({ version: 1, supervisorInstanceId: this.supervisorInstanceId, processes: this.snapshot() }, null, 2);
    const temporaryPath = `${this.metadataPath}.next`;
    await writeFile(temporaryPath, payload, { mode: 0o600 });
    await rename(temporaryPath, this.metadataPath);
  }

  async start(component, specification) {
    if (this.shuttingDown) throw new Error("Supervisor 正在停止，不能启动新进程。");
    if (this.isRunning(component)) return this.records.get(component);
    this.cancelRestart(component);
    const previous = this.records.get(component);
    const generation = (previous?.generation ?? 0) + 1;
    const child = this.spawnImpl(specification.command, specification.args, {
      cwd: specification.cwd,
      env: specification.env,
      stdio: "inherit",
      detached: this.platform !== "win32",
      shell: this.platform === "win32" && specification.command.endsWith(".cmd")
    });
    let resolveExit;
    const record = {
      component,
      pid: child.pid ?? null,
      generation,
      startedAt: new Date().toISOString(),
      supervisorInstanceId: this.supervisorInstanceId,
      managedState: "running",
      child,
      exitPromise: new Promise((resolve) => { resolveExit = resolve; })
    };
    this.records.set(component, record);
    const emitExit = (reason) => {
      if (this.records.get(component) !== record || record.managedState === "exited") return;
      record.managedState = "exited";
      resolveExit?.();
      void this.persistMetadata();
      this.onProcessEvent({ type: "exit", component, generation, intentional: record.intentionalStop === true, record: this.publicRecord(record), ...reason });
    };
    child.once("error", (error) => emitExit({ error: error.message }));
    child.once("exit", (code, signal) => emitExit({ code, signal }));
    await this.persistMetadata();
    this.onProcessEvent({ type: "started", component, generation, record: this.publicRecord(record) });
    return record;
  }

  publicRecord({ child, exitPromise, ...record }) {
    return { ...record, running: Boolean(child && child.exitCode === null) };
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

  async stop(component, { timeoutMs = 8_000 } = {}) {
    this.cancelRestart(component);
    const record = this.records.get(component);
    if (!record?.child || record.child.exitCode !== null) return;
    record.intentionalStop = true;
    record.managedState = "stopping";
    await this.persistMetadata();
    this.sendGracefulStop(record);
    const exited = await Promise.race([record.exitPromise.then(() => true), delay(timeoutMs).then(() => false)]);
    if (!exited && this.records.get(component) === record) {
      this.forceStop(record);
      await Promise.race([record.exitPromise, delay(2_000)]);
    }
  }

  sendGracefulStop(record) {
    if (!record.pid) return;
    try {
      if (this.platform !== "win32") process.kill(-record.pid, "SIGTERM");
      else record.child.kill("SIGTERM");
    } catch {
      try { record.child.kill("SIGTERM"); } catch { /* The process already exited. */ }
    }
  }

  forceStop(record) {
    if (!record.pid) return;
    if (this.platform === "win32") {
      const taskkill = this.spawnImpl("taskkill.exe", ["/pid", String(record.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      taskkill.once("error", () => {});
      return;
    }
    try { process.kill(-record.pid, "SIGKILL"); } catch { try { record.child.kill("SIGKILL"); } catch { /* The process already exited. */ } }
  }

  async stopAll(components) {
    this.shuttingDown = true;
    this.cancelAllRestarts();
    for (const component of components) await this.stop(component);
    await this.persistMetadata();
  }
}

export function managedMetadataPath(runtimeDirectories) {
  return path.join(runtimeDirectories.supervisor, "managed-processes.json");
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error && typeof error === "object" && error.code === "EPERM"; }
}

export async function assertNoLiveManagedOrphans(metadataPath) {
  const metadata = await readFile(metadataPath, "utf8").then(JSON.parse).catch(() => null);
  const live = (metadata?.processes ?? []).filter((record) => record?.managedState !== "exited" && processIsAlive(record?.pid));
  if (live.length > 0) throw new Error(`发现上一个 Supervisor 实例遗留的受管进程：${live.map((record) => record.component).join(", ")}。拒绝接管或终止，需先由原 Supervisor 或运维确认处理。`);
}
