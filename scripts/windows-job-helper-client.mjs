import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const helperVersion = 1;

function waitForLine(child, predicate, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => finish(reject, new Error("Windows Job Helper protocol timed out.")), timeoutMs);
    const finish = (callback, value) => { clearTimeout(timer); child.stdout?.off("data", onData); child.off("error", onError); callback(value); };
    const onError = (error) => finish(reject, error);
    const onData = (chunk) => {
      output += chunk.toString("utf8");
      for (const line of output.split("\n")) {
        try {
          const message = JSON.parse(line);
          if (predicate(message)) return finish(resolve, message);
        } catch {}
      }
      output = output.slice(output.lastIndexOf("\n") + 1);
    };
    child.stdout?.on("data", onData);
    child.once("error", onError);
  });
}

export async function verifyWindowsJobHelper({ helperPath, manifestPath, expectedSha256, readFileImpl = readFile } = {}) {
  if (!path.isAbsolute(helperPath || "")) throw new Error("Windows Job Helper path must be absolute.");
  await access(helperPath);
  const manifest = JSON.parse(await readFileImpl(manifestPath || `${helperPath}.manifest.json`, "utf8"));
  if (manifest.version !== helperVersion || manifest.architecture !== "x64" || typeof manifest.sha256 !== "string") throw new Error("Windows Job Helper manifest is invalid.");
  const actual = createHash("sha256").update(await readFileImpl(helperPath)).digest("hex");
  if (actual !== manifest.sha256 || actual !== expectedSha256) throw new Error("Windows Job Helper SHA-256 verification failed.");
  return { version: manifest.version, architecture: manifest.architecture, sha256: actual };
}

export class WindowsJobHelperClient {
  constructor({ spawnImpl = spawn, verifyHelper = verifyWindowsJobHelper } = {}) {
    this.spawnImpl = spawnImpl;
    this.verifyHelper = verifyHelper;
  }

  async spawn(specification, ownership) {
    const helper = specification?.windowsJobHelper;
    if (!helper?.path || !helper?.sha256) throw new Error("Windows Job Helper is required; automatic taskkill fallback is forbidden.");
    const integrity = await this.verifyHelper({ helperPath: helper.path, manifestPath: helper.manifestPath, expectedSha256: helper.sha256 });
    const jobInstanceId = randomUUID();
    const child = this.spawnImpl(helper.path, ["--component", ownership.component, "--supervisor-pid", String(process.pid), "--supervisor-instance-id", ownership.supervisorInstanceId, "--runtime-instance-id", ownership.runtimeInstanceId, "--generation", String(ownership.generation), "--job-instance-id", jobInstanceId, "--", specification.command, ...(specification.args ?? [])], {
      cwd: specification.cwd,
      env: specification.env,
      stdio: ["pipe", "pipe", "inherit"],
      windowsHide: true,
      detached: true,
      shell: false
    });
    const spawned = await waitForLine(child, (message) => message.event === "spawned");
    const root = new EventEmitter();
    root.pid = Number(spawned.pid);
    root.exitCode = null;
    root.signalCode = null;
    root.helper = child;
    root.jobOwnership = { provider: "ued-windows-job-helper", helperVersion: integrity.version, helperSha256: integrity.sha256, helperPath: helper.path, helperPid: child.pid ?? null, supervisorPid: ownership.supervisorPid ?? process.pid, jobInstanceId, killOnJobClose: true, rootAssigned: true, assignedAt: new Date().toISOString() };
    root.helperExitPromise = (child.exitCode !== null
      ? Promise.resolve({ code: child.exitCode, signal: child.signalCode })
      : new Promise((resolve) => {
        child.once("exit", (code, signal) => resolve({ code, signal }));
        child.once("error", (error) => resolve({ errorCode: error.code ?? "helper_process_error" }));
      })).then((status) => {
        root.helperExitStatus = status;
        Object.assign(root.jobOwnership, {
          helperExitCode: Number.isInteger(status.code) ? status.code : null,
          helperExitSignal: typeof status.signal === "string" ? status.signal : null,
          helperExitErrorCode: status.errorCode ?? null,
          helperExitedAt: new Date().toISOString()
        });
        root.emit("helper-exit", status);
        return status;
      });
    let helperOutput = "";
    child.stdout?.on("data", (chunk) => {
      helperOutput += chunk.toString("utf8");
      let newline;
      while ((newline = helperOutput.indexOf("\n")) >= 0) {
        const line = helperOutput.slice(0, newline);
        helperOutput = helperOutput.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (message.event === "root-exit" && root.exitCode === null) { root.exitCode = Number(message.value); root.emit("exit", root.exitCode, null); }
          if (message.event === "job-count") root.emit("job-count", Number(message.value));
          if (message.event === "job-query-failed") root.emit("job-query-failed", Number(message.value));
          if (message.event === "protocol-rejected") root.emit("protocol-rejected");
          if (message.event === "terminate-failed") root.emit("terminate-failed", Number(message.value));
          if (message.event === "terminated") root.emit("terminated");
        } catch {}
      }
    });
    child.once("error", (error) => root.emit("error", error));
    child.once("exit", () => { if (root.exitCode === null) { root.exitCode = 1; root.emit("exit", root.exitCode, null); } });
    return root;
  }

  request(record, operation) {
    const job = record?.jobOwnership;
    if (!job?.jobInstanceId) throw Object.assign(new Error("Windows Job ownership is unavailable."), { reasonCode: "windows_job_ownership_unavailable" });
    if (!record?.child?.helper?.stdin?.writable) throw Object.assign(new Error("Windows Job Helper input pipe is unavailable."), { reasonCode: "windows_job_pipe_unavailable" });
    try {
      record.child.helper.stdin.write(`${operation} ${job.jobInstanceId} ${record.supervisorInstanceId} ${record.runtimeInstanceId} ${record.component} ${record.generation}\n`);
    } catch (cause) {
      throw Object.assign(new Error("Windows Job Helper input pipe write failed."), { reasonCode: "windows_job_pipe_write_failed", causeCode: cause?.code ?? null });
    }
  }

  async activeProcessCount(record) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(reject, Object.assign(new Error("Windows Job query timed out."), { reasonCode: "windows_job_query_timeout" })), 2_000);
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        for (const [event, listener] of listeners) record.child.off(event, listener);
        callback(value);
      };
      const onCount = (count) => finish(resolve, count);
      const fail = (reasonCode, message, details = {}) => {
        const error = Object.assign(new Error(message), { reasonCode, ...details });
        finish(reject, error);
      };
      const onQueryFailed = (win32ErrorCode) => fail("windows_job_query_failed", `Windows Job query failed with Win32 error ${win32ErrorCode}.`, { win32ErrorCode });
      const onProtocolRejected = () => fail("windows_job_protocol_rejected", "Windows Job Helper rejected the bound query.");
      const onHelperExit = (status) => fail("windows_job_helper_exited", "Windows Job Helper exited before replying to the query.", {
        helperExitCode: Number.isInteger(status?.code) ? status.code : null,
        helperExitSignal: typeof status?.signal === "string" ? status.signal : null,
        helperExitErrorCode: status?.errorCode ?? null
      });
      const listeners = [["job-count", onCount], ["job-query-failed", onQueryFailed], ["protocol-rejected", onProtocolRejected], ["helper-exit", onHelperExit]];
      for (const [event, listener] of listeners) record.child.once(event, listener);
      if (record.child.helperExitStatus) onHelperExit(record.child.helperExitStatus);
      if (!settled) try { this.request(record, "query"); } catch (error) { finish(reject, error); }
    });
  }

  async terminate(record) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(reject, Object.assign(new Error("Windows Job termination timed out."), { reasonCode: "windows_job_termination_timeout" })), 2_000);
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        record.child.off("terminated", onTerminated);
        record.child.off("terminate-failed", onTerminateFailed);
        callback(value);
      };
      let settled = false;
      const onTerminated = () => finish(resolve);
      const onTerminateFailed = (win32ErrorCode) => finish(reject, Object.assign(new Error(`Windows Job termination failed with Win32 error ${win32ErrorCode}.`), { reasonCode: "windows_job_termination_failed", win32ErrorCode }));
      record.child.once("terminated", onTerminated);
      record.child.once("terminate-failed", onTerminateFailed);
      try { this.request(record, "terminate"); } catch (error) { finish(reject, error); }
    });
  }

  shutdown(record) {
    this.request(record, "shutdown-helper");
  }

  async waitForHelperExit(record, timeoutMs) {
    let timer;
    return Promise.race([
      record?.child?.helperExitPromise ?? Promise.resolve(null),
      new Promise((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); })
    ]).finally(() => clearTimeout(timer));
  }
}
