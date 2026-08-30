import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { WindowsJobHelperClient } from "./windows-job-helper-client.mjs";
import { requestGracefulCapability } from "./windows-graceful-pipe.mjs";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function commandFingerprint({ command, args = [], cwd = "" }) {
  return createHash("sha256").update(JSON.stringify({ command, args, cwd })).digest("hex");
}

function normalizeExecutable(value, platform) {
  if (typeof value !== "string" || !value) return null;
  const normalized = platform === "win32" ? path.win32.normalize(value) : path.normalize(value);
  return platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

function childRunning(child) {
  return Boolean(child && child.exitCode === null && child.signalCode == null);
}

function waitForChildExit(child, timeoutMs) {
  if (!childRunning(child)) return Promise.resolve(true);
  return Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    delay(timeoutMs).then(() => false)
  ]);
}

async function inspectWindowsProcess(pid, { spawnImpl = spawn } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  const script = "[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $p=Get-CimInstance Win32_Process -Filter ('ProcessId = ' + $args[0]); if ($null -ne $p) { [pscustomobject]@{ pid=$p.ProcessId; creationTime=$p.CreationDate; executablePath=$p.ExecutablePath; commandLine=$p.CommandLine; parentPid=$p.ParentProcessId } | ConvertTo-Json -Compress }";
  return new Promise((resolve) => {
    let output = "";
    let child;
    try {
      child = spawnImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script, String(pid)], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true, shell: false });
    } catch {
      resolve(null);
      return;
    }
    child.stdout?.setEncoding?.("utf8");
    child.stdout?.on("data", (chunk) => { output += chunk; });
    child.once("error", () => resolve(null));
    child.once("exit", (code) => {
      if (code !== 0 || !output.trim()) { resolve(null); return; }
      try {
        const value = JSON.parse(output);
        resolve({ pid: Number(value.pid), processCreationTime: String(value.creationTime), executablePath: value.executablePath || null, commandLine: value.commandLine || "", parentPid: Number.isInteger(value.parentPid) ? value.parentPid : null });
      } catch { resolve(null); }
    });
  });
}

export class ManagedProcessPlatformAdapter {
  constructor({ platform = process.platform, spawnImpl = spawn, inspectProcess } = {}) {
    this.platform = platform;
    this.spawnImpl = spawnImpl;
    this.inspectProcess = inspectProcess;
  }

  spawn(specification) {
    return this.spawnImpl(specification.command, specification.args, {
      cwd: specification.cwd,
      env: specification.env,
      stdio: "inherit",
      detached: this.platform !== "win32",
      shell: this.platform === "win32" && specification.command.endsWith(".cmd")
    });
  }

  async captureIdentity({ child, specification, supervisorInstanceId, runtimeInstanceId, generation }) {
    const startedAt = new Date().toISOString();
    return {
      pid: child?.pid ?? null,
      platform: this.platform,
      processCreationTime: startedAt,
      executablePath: normalizeExecutable(specification.command, this.platform),
      commandFingerprint: commandFingerprint(specification),
      supervisorInstanceId,
      runtimeInstanceId,
      generation,
      ownershipCapability: "child_handle"
    };
  }

  async inspect(record) {
    if (!childRunning(record.child)) return { alive: false, ownership: "unknown", reasonCode: "process_not_alive" };
    return { alive: true, ownership: "strong", reasonCode: null };
  }

  async inspectStoredProcess(record) {
    if (!Number.isInteger(record?.pid) || record.pid <= 0) return { alive: false, ownership: "unknown", reasonCode: "pid_invalid" };
    try {
      process.kill(record.pid, 0);
      return { alive: true, ownership: "unknown", reasonCode: "stored_identity_unverifiable" };
    } catch (error) {
      return error && typeof error === "object" && error.code === "EPERM"
        ? { alive: true, ownership: "unknown", reasonCode: "stored_identity_unverifiable" }
        : { alive: false, ownership: "unknown", reasonCode: "process_not_alive" };
    }
  }

  async requestGracefulShutdown(record) {
    if (!record?.pid) return { acknowledged: true };
    try {
      process.kill(-record.pid, "SIGTERM");
    } catch {
      try { record.child.kill("SIGTERM"); } catch { /* Process already exited. */ }
    }
    return { acknowledged: true };
  }

  waitForExit(record, timeoutMs) {
    return waitForChildExit(record.child, timeoutMs);
  }

  async forceTerminate(record) {
    const ownership = await this.inspect(record);
    if (ownership.ownership !== "strong") throw new Error("Managed process ownership cannot be proven; forced stop is forbidden.");
    try { process.kill(-record.pid, "SIGKILL"); } catch { try { record.child.kill("SIGKILL"); } catch { /* Process already exited. */ } }
  }

  async verifyConvergence(record, specification) {
    if (childRunning(record.child)) throw new Error(`受管进程 ${record.component} 尚未退出。`);
    await specification?.convergence?.verify?.();
  }

  async cleanup() {}
}

export class PosixProcessAdapter extends ManagedProcessPlatformAdapter {}

export class WindowsProcessAdapter extends ManagedProcessPlatformAdapter {
  constructor(options = {}) {
    super({ ...options, platform: "win32" });
    this.inspectProcess = options.inspectProcess ?? ((pid) => inspectWindowsProcess(pid, { spawnImpl: this.spawnImpl }));
    this.jobHelper = options.jobHelper ?? new WindowsJobHelperClient({ spawnImpl: this.spawnImpl });
    this.gracefulCapabilities = new WeakMap();
    this.bootstrapPath = options.bootstrapPath ?? path.resolve(import.meta.dirname, "windows-graceful-bootstrap.mjs");
    this.requestGraceful = options.requestGraceful ?? requestGracefulCapability;
  }

  async spawn(specification, ownership = {}) {
    const endpoint = `\\\\.\\pipe\\ued-asset-hub-graceful-${randomBytes(18).toString("hex")}`;
    const token = randomBytes(32).toString("base64url");
    const nodeArguments = ["--import", this.bootstrapPath, ...(specification.args ?? [])];
    const child = await this.jobHelper.spawn({ ...specification, args: nodeArguments, env: { ...specification.env, UED_GRACEFUL_ENDPOINT: endpoint, UED_GRACEFUL_TOKEN: token, UED_RUNTIME_INSTANCE_ID: ownership.runtimeInstanceId, UED_MANAGED_COMPONENT: ownership.component, UED_MANAGED_GENERATION: String(ownership.generation) } }, ownership);
    this.gracefulCapabilities.set(child, { endpoint, token });
    return child;
  }

  async captureIdentity(context) {
    const observed = await this.inspectProcess(context.child?.pid);
    if (!observed?.processCreationTime || !observed.executablePath || !observed.commandLine) {
      return { ...await super.captureIdentity(context), ownershipCapability: "identity_unavailable" };
    }
    return {
      pid: observed.pid,
      platform: "win32",
      processCreationTime: observed.processCreationTime,
      executablePath: normalizeExecutable(observed.executablePath, "win32"),
      commandFingerprint: createHash("sha256").update(observed.commandLine).digest("hex"),
      expectedCommandFingerprint: commandFingerprint(context.specification),
      parentPid: observed.parentPid,
      supervisorInstanceId: context.supervisorInstanceId,
      runtimeInstanceId: context.runtimeInstanceId,
      generation: context.generation,
      ownershipCapability: "process_identity"
    };
  }

  async inspect(record) {
    if (!childRunning(record.child)) return { alive: false, ownership: "unknown", reasonCode: "process_not_alive" };
    const observed = await this.inspectProcess(record.pid);
    return this.compareIdentity(record, observed, { requireRuntimeFields: false });
  }

  compareIdentity(record, observed, { requireRuntimeFields = true } = {}) {
    if (!observed) return { alive: false, ownership: "unknown", reasonCode: "process_not_alive" };
    if (!record?.supervisorInstanceId || !record?.runtimeInstanceId || !Number.isInteger(record?.generation)) return { alive: true, ownership: "unknown", reasonCode: "metadata_identity_incomplete" };
    if (record.pid !== observed.pid) return { alive: true, ownership: "unknown", reasonCode: "pid_mismatch" };
    if (record.processCreationTime !== observed.processCreationTime) return { alive: true, ownership: "unknown", reasonCode: "process_creation_time_mismatch" };
    if (normalizeExecutable(record.executablePath, "win32") !== normalizeExecutable(observed.executablePath, "win32")) return { alive: true, ownership: "unknown", reasonCode: "executable_mismatch" };
    if (record.commandFingerprint !== createHash("sha256").update(observed.commandLine || "").digest("hex")) return { alive: true, ownership: "unknown", reasonCode: "command_fingerprint_mismatch" };
    if (requireRuntimeFields && (!record.runtimeInstanceId || !record.supervisorInstanceId)) return { alive: true, ownership: "unknown", reasonCode: "runtime_identity_mismatch" };
    return { alive: true, ownership: "strong", reasonCode: null };
  }

  async inspectStoredProcess(record) {
    return this.compareIdentity(record, await this.inspectProcess(record?.pid));
  }

  async requestGracefulShutdown(record) {
    const capability = this.gracefulCapabilities.get(record.child);
    if (!capability) return { acknowledged: false, reasonCode: "graceful_shutdown_capability_missing" };
    return this.requestGraceful({ ...capability, runtimeInstanceId: record.runtimeInstanceId, component: record.component, generation: record.generation });
  }

  publicIdentity(record) {
    const { child, exitPromise, exitPersistence, ...identity } = record;
    return identity;
  }

  async forceTerminate(record) {
    const ownership = await this.inspect(record);
    if (ownership.ownership !== "strong") throw new Error(`Managed process ownership cannot be proven (${ownership.reasonCode}); forced stop is forbidden.`);
    if (!record.jobOwnership?.rootAssigned || !record.jobOwnership?.jobInstanceId) throw new Error("Windows Job ownership is unavailable; automatic taskkill fallback is forbidden.");
    await this.jobHelper.terminate(record);
  }

  async verifyConvergence(record, specification) {
    await super.verifyConvergence(record, specification);
    const count = await this.jobHelper.activeProcessCount(record);
    if (count !== 0) throw new Error(`Windows Job for ${record.component} still has ${count} active processes.`);
    const observed = await this.inspectProcess(record.pid);
    if (observed) throw new Error(`已归属的 ${record.component} 进程仍存活，未收敛。`);
  }

  async cleanup(record) {
    if (record?.jobOwnership?.jobInstanceId) this.jobHelper.shutdown(record);
  }
}

export function createManagedProcessPlatformAdapter({ platform = process.platform, ...options } = {}) {
  return platform === "win32" ? new WindowsProcessAdapter(options) : new PosixProcessAdapter({ ...options, platform });
}
