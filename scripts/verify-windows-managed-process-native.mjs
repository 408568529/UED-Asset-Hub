import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { createServer, connect } from "node:net";
import os from "node:os";
import path from "node:path";
import { ManagedProcessController } from "./managed-process-controller.mjs";
import { WindowsProcessAdapter } from "./managed-process-platform-adapter.mjs";
import { WindowsJobHelperClient } from "./windows-job-helper-client.mjs";

if (process.platform !== "win32") {
  console.log("[UED Agent] Windows native managed-process verification: SKIPPED (requires Windows Server 2025 x64, Node 22.23.3, and an MSVC-built helper).");
  process.exit(0);
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--") || process.argv.indexOf(name, index + 1) !== -1) throw new Error(`Invalid ${name} option.`);
  return value;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(action, label, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let failure = null;
  while (Date.now() < deadline) {
    try { return await action(); } catch (error) { failure = error; }
    await delay(50);
  }
  throw failure ?? new Error(`${label} timed out.`);
}

async function readJsonWhenAvailable(file) {
  return waitFor(async () => JSON.parse(await readFile(file, "utf8")), `observer result ${file}`);
}

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Unable to allocate a fixture port.");
  return address.port;
}

async function portOpen(port) {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(200, () => finish(false));
  });
}

async function waitForPortOpen(port) {
  return waitFor(async () => {
    assert.equal(await portOpen(port), true, `fixture port ${port} is not open`);
  }, `fixture port ${port}`);
}

async function portReleased(port) {
  return waitFor(async () => {
    const server = createServer();
    await new Promise((resolve, reject) => server.once("error", reject).listen(port, "127.0.0.1", resolve));
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }, `fixture port ${port} release`);
}

function waitForHelperEvent(helper, event, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    let pending = "";
    const timer = setTimeout(() => finish(reject, new Error(`Helper event ${event} timed out.`)), timeoutMs);
    const finish = (callback, value) => { clearTimeout(timer); helper.stdout.off("data", onData); callback(value); };
    const onData = (chunk) => {
      pending += chunk.toString("utf8");
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (message.event === event) return finish(resolve, message);
        } catch {}
      }
    };
    helper.stdout.on("data", onData);
  });
}

function ownership() {
  return { component: "dsh", supervisorInstanceId: "native-supervisor", runtimeInstanceId: "native-runtime", generation: 1 };
}

const root = path.resolve(import.meta.dirname, "..");
const helperPath = path.resolve(option("--helper-path") ?? path.join(root, "native", "windows-job-helper", "bin", "ued-windows-job-helper.exe"));
const manifestPath = path.resolve(option("--helper-manifest-path") ?? path.join(root, "native", "windows-job-helper", "bin", "ued-windows-job-helper.manifest.json"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.architecture, "x64");
assert.equal(manifest.sha256, createHash("sha256").update(await readFile(helperPath)).digest("hex"), "helper integrity manifest must match binary");
await access(helperPath);

function helperConfiguration() {
  return { path: helperPath, manifestPath, sha256: manifest.sha256 };
}

function recordFor(child) {
  return { child, jobOwnership: child.jobOwnership, ...ownership() };
}

async function stopHelper(client, record) {
  try {
    if (record.child.exitCode === null) await client.terminate(record);
  } catch {}
  try { client.shutdown(record); } catch {}
  if (record.child.helper?.exitCode === null) await Promise.race([once(record.child.helper, "exit"), delay(2_000)]);
}

async function testChildObservedArgvAndSecurity() {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "ued-windows-job-argv-"));
  const observedPath = path.join(sandbox, "child-observed.json");
  const expectedCwd = path.join(sandbox, "cwd 中文 with spaces");
  const observerPath = path.join(sandbox, "fixture 中文 with spaces", "windows-argv-observer.mjs");
  const injectionProbe = path.join(sandbox, "shell-injection-probe.txt");
  await mkdir(path.dirname(observerPath), { recursive: true });
  await mkdir(expectedCwd, { recursive: true });
  await copyFile(path.join(root, "scripts", "fixtures", "windows-argv-observer.mjs"), observerPath);
  const expectedArgv = [
    "simple-ascii",
    "D:\\absolute\\fixture.mjs",
    "C:\\path with spaces\\fixture.mjs",
    "argument containing spaces",
    "literal\"quote",
    "ordinary\\backslashes\\remain",
    "backslashes-before-quote\\\\\"",
    "trailing-backslash\\",
    "",
    "multiple-1",
    "multiple-2",
    "Unicode-λ-你好",
    "中文路径\\文件名.mjs",
    "key=value",
    "colon:value",
    "d:",
    `& echo injected > "${injectionProbe}" & | < > ^ ; % !`
  ];
  const client = new WindowsJobHelperClient();
  let record = null;
  try {
    const child = await client.spawn({
      command: process.execPath,
      args: [observerPath, ...expectedArgv],
      cwd: expectedCwd,
      env: { ...process.env, UED_ARGV_OBSERVATION_PATH: observedPath, UED_ARGV_OBSERVER_HOLD: "true" },
      windowsJobHelper: helperConfiguration()
    }, ownership());
    record = recordFor(child);
    const observed = await readJsonWhenAvailable(observedPath);
    assert.deepEqual(observed.argv, expectedArgv, "child observes every Windows argv element exactly");
    assert.equal(observed.cwd, expectedCwd, "child inherits the expected cwd");
    assert.equal(observed.parentPid, child.helper.pid, "child is launched directly by the Job Helper without a shell intermediary");
    assert.equal(await client.activeProcessCount(record), 1, "the observer is the only active process in its owned Job");
    await assert.rejects(() => access(injectionProbe), /ENOENT/, "shell metacharacters do not create an injection side-effect file");
    const rejected = waitForHelperEvent(child.helper, "protocol-rejected");
    child.helper.stdin.write("malformed-control\n");
    await rejected;
  } finally {
    if (record) await stopHelper(client, record);
    await rm(sandbox, { recursive: true, force: true });
  }
}

async function helperExit(args, cwd) {
  const child = spawn(helperPath, args, { cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false });
  const [code] = await once(child, "exit");
  return code;
}

async function testMalformedStartupAndMissingExecutable() {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "ued-windows-job-negative-"));
  try {
    assert.equal(await helperExit(["--component", "dsh"], sandbox), 64, "malformed helper startup protocol is rejected");
    const values = ["--component", "dsh", "--supervisor-pid", String(process.pid), "--supervisor-instance-id", "native-supervisor", "--runtime-instance-id", "native-runtime", "--generation", "1", "--job-instance-id", "native-job", "--", path.join(sandbox, "missing-child.exe")];
    assert.equal(await helperExit(values, sandbox), 68, "missing child executable is rejected without shell fallback");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

async function testInvalidCwdFailsClosed() {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "ued-windows-job-invalid-cwd-"));
  const client = new WindowsJobHelperClient();
  try {
    await assert.rejects(() => client.spawn({ command: process.execPath, args: ["-e", "process.exit(0)"], cwd: path.join(sandbox, "missing-cwd"), env: process.env, windowsJobHelper: helperConfiguration() }, ownership()), /ENOENT|spawn/i, "invalid helper cwd fails before child launch");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

async function runFixture({ ignoreShutdown }) {
  const port = await freePort();
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "ued-windows-job-native-"));
  const adapter = new WindowsProcessAdapter();
  const controller = new ManagedProcessController({ supervisorInstanceId: "native-supervisor", runtimeInstanceId: "native-runtime", platform: "win32", adapter });
  const specification = {
    command: process.execPath,
    args: [path.join(root, "scripts", "fixtures", "managed-process-fixture.mjs"), "--port", String(port), "--ignore-shutdown", String(ignoreShutdown), "--with-descendant", "true"],
    cwd: root,
    env: process.env,
    windowsJobHelper: helperConfiguration(),
    convergence: { verify: () => portReleased(port) }
  };
  const record = await controller.start("dsh", specification);
  await waitForPortOpen(port);
  assert.equal(record.jobOwnership.rootAssigned, true, "root is assigned before resume");
  assert.equal((await adapter.jobHelper.activeProcessCount(record)) >= 2, true, "fixture and descendant are members of the owned Job");
  return { controller, record, port, sandbox };
}

async function testLifecycleReadinessAndConvergence() {
  const graceful = await runFixture({ ignoreShutdown: false });
  try {
    await graceful.controller.stop("dsh", { timeoutMs: 10_000 });
    assert.equal(graceful.record.graceful.outcome, "accepted", "graceful pipe shutdown is accepted");
    assert.equal(graceful.record.convergence.verifiedAt !== null, true, "graceful root, tree, port, and pipe convergence is verified");
  } finally {
    await rm(graceful.sandbox, { recursive: true, force: true });
  }

  const forced = await runFixture({ ignoreShutdown: true });
  try {
    await forced.controller.stop("dsh", { timeoutMs: 100 });
    assert.equal(forced.record.graceful.outcome, "timed_out_forced", "timeout uses the Job Helper forced-stop path");
    assert.equal(forced.record.convergence.verifiedAt !== null, true, "forced root, tree, port, and pipe convergence is verified");
  } finally {
    await rm(forced.sandbox, { recursive: true, force: true });
  }
}

await testChildObservedArgvAndSecurity();
await testMalformedStartupAndMissingExecutable();
await testInvalidCwdFailsClosed();
await testLifecycleReadinessAndConvergence();
console.log("[UED Agent] Windows native managed-process verification passed.");
