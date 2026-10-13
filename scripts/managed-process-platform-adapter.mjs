import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { WindowsJobHelperClient } from "./windows-job-helper-client.mjs";
import { requestGracefulCapability } from "./windows-graceful-pipe.mjs";
import { runtimeControlEndpoint } from "./runtime-control-transport.mjs";

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
  const script = `[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($null -ne $p) { [pscustomobject]@{ pid=$p.ProcessId; creationTime=$p.CreationDate; executablePath=$p.ExecutablePath; commandLine=$p.CommandLine; parentPid=$p.ParentProcessId } | ConvertTo-Json -Compress }`;
  return new Promise((resolve) => {
    let output = "";
    let child;
    try {
      child = spawnImpl("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: ["ignore", "pipe", "ignore"], windowsHide: true, shell: false });
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
        const pid = Number(value?.pid);
        if (!Number.isInteger(pid) || pid <= 0 || typeof value?.creationTime !== "string" || !value.creationTime) { resolve(null); return; }
        resolve({ pid, processCreationTime: value.creationTime, executablePath: value.executablePath || null, commandLine: value.commandLine || "", parentPid: Number.isInteger(value.parentPid) ? value.parentPid : null });
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
    const endpoint = runtimeControlEndpoint({ scope: "graceful", instanceId: randomBytes(18).toString("hex"), platform: "win32" });
    const token = randomBytes(32).toString("base64url");
    const nodeArguments = ["--import", pathToFileURL(this.bootstrapPath).href, ...(specification.args ?? [])];
    const child = await this.jobHelper.spawn({ ...specification, args: nodeArguments, env: { ...specification.env, UED_GRACEFUL_ENDPOINT: endpoint, UED_GRACEFUL_TOKEN: token, UED_RUNTIME_INSTANCE_ID: ownership.runtimeInstanceId, UED_MANAGED_COMPONENT: ownership.component, UED_MANAGED_GENERATION: String(ownership.generation) } }, { ...ownership, supervisorPid: process.pid });
    this.gracefulCapabilities.set(child, { endpoint, token });
    return child;
  }

  async captureIdentity(context) {
    const observed = await this.inspectProcess(context.child?.pid);
    if (!observed?.processCreationTime || !observed.executablePath || !observed.commandLine) {
      return { ...await super.captureIdentity(context), ownershipCapability: "identity_unavailable" };
    }
    const helperObserved = await this.inspectProcess(context.child?.helper?.pid);
    const jobOwnership = context.child?.jobOwnership ?? null;
    if (jobOwnership && helperObserved?.processCreationTime && helperObserved.executablePath && helperObserved.commandLine) {
      Object.assign(jobOwnership, {
        helperIdentity: {
          pid: helperObserved.pid,
          processCreationTime: helperObserved.processCreationTime,
          executablePath: normalizeExecutable(helperObserved.executablePath, "win32"),
          commandFingerprint: createHash("sha256").update(helperObserved.commandLine).digest("hex"),
          parentPid: helperObserved.parentPid
        }
      });
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
      ownershipCapability: "process_identity",
      jobOwnership
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

  async verifyConvergence(record, specification, { deadlineAt = Date.now() + 8_000 } = {}) {
    await super.verifyConvergence(record, {});
    let activeProcessCount = null;
    let portReleased = false;
    let rootProcessPresent = false;
    while (Date.now() <= deadlineAt) {
      try {
        activeProcessCount = await this.jobHelper.activeProcessCount(record);
        record.convergence.activeProcessCount = activeProcessCount;
      } catch (queryError) {
        const reasonCode = queryError?.reasonCode ?? "windows_job_query_failed";
        record.convergence.jobQueryFailure = {
          reasonCode,
          win32ErrorCode: Number.isInteger(queryError?.win32ErrorCode) ? queryError.win32ErrorCode : null,
          helperExitCode: Number.isInteger(queryError?.helperExitCode) ? queryError.helperExitCode : null,
          helperExitSignal: typeof queryError?.helperExitSignal === "string" ? queryError.helperExitSignal : null,
          helperExitErrorCode: typeof queryError?.helperExitErrorCode === "string" ? queryError.helperExitErrorCode : null,
          observedAt: new Date().toISOString()
        };
        const detail = Number.isInteger(queryError?.win32ErrorCode)
          ? ` Win32 error ${queryError.win32ErrorCode}.`
          : Number.isInteger(queryError?.helperExitCode)
            ? ` Helper exit code ${queryError.helperExitCode}.`
            : queryError?.helperExitSignal
              ? ` Helper exit signal ${queryError.helperExitSignal}.`
              : "";
        const error = new Error(`Windows Job state for ${record.component} could not be queried (${reasonCode}).${detail}`);
        error.reasonCode = reasonCode;
        throw error;
      }
      portReleased = false;
      rootProcessPresent = false;
      if (activeProcessCount === 0) {
        try {
          await specification?.convergence?.verify?.();
          portReleased = true;
        } catch (error) {
          if (error?.reasonCode !== "managed_component_port_not_released") throw error;
        }
        if (portReleased) {
          rootProcessPresent = Boolean(await this.inspectProcess(record.pid));
          if (!rootProcessPresent) return;
        }
      }
      if (Date.now() < deadlineAt) await delay(Math.min(100, deadlineAt - Date.now()));
    }
    const reasonCode = activeProcessCount !== 0
      ? "windows_job_not_empty"
      : !portReleased
        ? "managed_component_port_not_released"
        : "managed_root_process_still_present";
    const error = new Error(`Windows convergence timed out for ${record.component}.`);
    error.reasonCode = reasonCode;
    throw error;
  }

  async safeFallbackAfterJobNotEmpty(record, specification, { timeoutMs = 8_000 } = {}) {
    const job = record?.jobOwnership;
    const helper = record?.child?.helper;
    const identity = job?.helperIdentity;
    if (record?.platform !== "win32" || record?.ownershipCapability !== "process_identity" || record?.graceful?.outcome !== "accepted" || record?.child?.exitCode === null) {
      throw new Error("Owned Job fallback requires a naturally exited, identity-verified Windows component.");
    }
    if (job?.provider !== "ued-windows-job-helper" || job?.rootAssigned !== true || job?.killOnJobClose !== true || !job?.jobInstanceId || !Number.isInteger(job?.helperPid) || !helper || !identity || identity.pid !== job.helperPid || job.supervisorPid !== process.pid) {
      throw new Error("Owned Job fallback identity is incomplete; refusing to terminate.");
    }
    const helperPath = specification?.windowsJobHelper?.path;
    if (!helperPath || normalizeExecutable(helperPath, "win32") !== normalizeExecutable(job.helperPath, "win32")) {
      throw new Error("Owned Job fallback helper path does not match the approved staging helper.");
    }
    const observed = await this.inspectProcess(job.helperPid);
    if (!observed || observed.processCreationTime !== identity.processCreationTime || normalizeExecutable(observed.executablePath, "win32") !== identity.executablePath || createHash("sha256").update(observed.commandLine || "").digest("hex") !== identity.commandFingerprint || observed.parentPid !== job.supervisorPid) {
      throw new Error("Owned Job fallback helper process identity changed; refusing to terminate.");
    }
    const commandLine = observed.commandLine || "";
    for (const binding of [job.jobInstanceId, record.supervisorInstanceId, record.runtimeInstanceId, record.component, String(record.generation)]) {
      if (!commandLine.includes(binding)) throw new Error("Owned Job fallback helper command binding changed; refusing to terminate.");
    }
    await this.jobHelper.verifyHelper({ helperPath: job.helperPath, manifestPath: specification.windowsJobHelper.manifestPath, expectedSha256: job.helperSha256 });

    const deadlineAt = Date.now() + timeoutMs;
    const fallback = { used: true, outcome: "running", reasonCode: "windows_job_not_empty", ownershipVerifiedAt: new Date().toISOString(), jobInstanceId: job.jobInstanceId, helperPid: job.helperPid, requestedAt: new Date().toISOString(), activeProcessCountBefore: record.convergence.activeProcessCount };
    record.convergence.fallback = fallback;
    await this.jobHelper.terminate(record);
    let activeProcessCount = null;
    do {
      activeProcessCount = await this.jobHelper.activeProcessCount(record);
      if (activeProcessCount === 0) break;
      if (Date.now() < deadlineAt) await delay(Math.min(100, deadlineAt - Date.now()));
    } while (Date.now() <= deadlineAt);
    fallback.activeProcessCountAfter = activeProcessCount;
    if (activeProcessCount !== 0) {
      fallback.outcome = "failed";
      fallback.failureReasonCode = "owned_job_did_not_empty";
      throw new Error("Owned Windows Job did not reach zero active processes after bounded termination.");
    }

    this.jobHelper.shutdown(record);
    const helperExit = await this.jobHelper.waitForHelperExit(record, Math.max(0, deadlineAt - Date.now()));
    if (!helperExit || helperExit.code !== 0 || helperExit.signal) {
      fallback.outcome = "failed";
      fallback.failureReasonCode = "owned_job_helper_exit_unverified";
      throw new Error("Owned Windows Job helper did not exit cleanly after fallback.");
    }
    try {
      await specification?.convergence?.verify?.();
      fallback.portsReleased = true;
    } catch (error) {
      fallback.outcome = "failed";
      fallback.failureReasonCode = error?.reasonCode ?? "managed_component_port_not_released";
      throw error;
    }
    if (await this.inspectProcess(record.pid)) {
      fallback.outcome = "failed";
      fallback.failureReasonCode = "managed_root_process_still_present";
      throw new Error("Owned Windows Job fallback left its component root process present.");
    }
    fallback.helperExited = true;
    job.helperExited = true;
    fallback.rootExited = true;
    fallback.completedAt = new Date().toISOString();
    fallback.outcome = "completed";
    return fallback;
  }

  async cleanup(record) {
    if (!record?.jobOwnership?.jobInstanceId || record.jobOwnership.helperExited === true) return;
    if (typeof this.jobHelper.waitForHelperExit !== "function") { this.jobHelper.shutdown(record); return; }
    this.jobHelper.shutdown(record);
    const helperExit = await this.jobHelper.waitForHelperExit(record, 2_000);
    if (!helperExit || helperExit.code !== 0 || helperExit.signal) throw new Error("Owned Windows Job helper did not exit after cleanup.");
    record.jobOwnership.helperExited = true;
  }
}

export function createManagedProcessPlatformAdapter({ platform = process.platform, ...options } = {}) {
  return platform === "win32" ? new WindowsProcessAdapter(options) : new PosixProcessAdapter({ ...options, platform });
}
