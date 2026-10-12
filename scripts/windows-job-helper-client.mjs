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
      shell: false
    });
    const spawned = await waitForLine(child, (message) => message.event === "spawned");
    const root = new EventEmitter();
    root.pid = Number(spawned.pid);
    root.exitCode = null;
    root.signalCode = null;
    root.helper = child;
    root.jobOwnership = { provider: "ued-windows-job-helper", helperVersion: integrity.version, helperSha256: integrity.sha256, helperPath: helper.path, helperPid: child.pid ?? null, supervisorPid: ownership.supervisorPid ?? process.pid, jobInstanceId, killOnJobClose: true, rootAssigned: true, assignedAt: new Date().toISOString() };
    root.helperExitPromise = child.exitCode !== null
      ? Promise.resolve({ code: child.exitCode, signal: child.signalCode })
      : new Promise((resolve) => {
        child.once("exit", (code, signal) => resolve({ code, signal }));
        child.once("error", (error) => resolve({ error: error.message }));
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
    if (!job?.jobInstanceId || !record?.child?.helper?.stdin?.writable) throw new Error("Windows Job ownership is unavailable.");
    record.child.helper.stdin.write(`${operation} ${job.jobInstanceId} ${record.supervisorInstanceId} ${record.runtimeInstanceId} ${record.component} ${record.generation}\n`);
  }

  async activeProcessCount(record) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(reject, new Error("Windows Job query timed out.")), 2_000);
      const finish = (callback, value) => { clearTimeout(timer); record.child.off("job-count", onCount); callback(value); };
      const onCount = (count) => finish(resolve, count);
      record.child.once("job-count", onCount);
      try { this.request(record, "query"); } catch (error) { finish(reject, error); }
    });
  }

  async terminate(record) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(reject, new Error("Windows Job termination timed out.")), 2_000);
      const finish = (callback, value) => { clearTimeout(timer); record.child.off("terminated", onTerminated); callback(value); };
      const onTerminated = () => finish(resolve);
      record.child.once("terminated", onTerminated);
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
