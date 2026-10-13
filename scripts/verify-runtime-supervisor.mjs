import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ManagedProcessController, assertNoLiveManagedOrphans } from "./managed-process-controller.mjs";
import { WindowsProcessAdapter } from "./managed-process-platform-adapter.mjs";
import { WindowsJobHelperClient } from "./windows-job-helper-client.mjs";
import { createGracefulCapability, requestGracefulCapability } from "./windows-graceful-pipe.mjs";
import { RuntimeLifecycleCore } from "./runtime-lifecycle-core.mjs";
import { ensureRuntimePaths, inspectRuntimePaths } from "./runtime-path-safety.mjs";
import { acquireSupervisorLock } from "./supervisor-lock.mjs";
import { createSharedShutdown } from "./host-supervisor.mjs";

function runtime({ credentialStatus = "configured", agentConfigurationStatus = "valid" } = {}) {
  return { dsh: true, gateway: true, proxy: true, mcp: true, credentialStatus, agentConfigurationStatus };
}

function createCore({ staticResult = { ok: true }, runtimeResult = runtime(), failComponent = null, componentError = null, prepareError = null, managed = false } = {}) {
  const starts = [];
  const stops = [];
  const running = new Set();
  let currentStatic = staticResult;
  let currentRuntime = runtimeResult;
  let currentFailComponent = failComponent;
  let currentComponentError = componentError;
  let currentPrepareError = prepareError;
  const controller = { get: () => ({ generation: 1 }) };
  const core = new RuntimeLifecycleCore({
    controller,
    inspectStatic: async () => typeof currentStatic === "function" ? currentStatic() : currentStatic,
    inspectRuntime: async () => {
      if (Array.isArray(currentRuntime)) return currentRuntime.length > 1 ? currentRuntime.shift() : currentRuntime[0];
      return typeof currentRuntime === "function" ? currentRuntime() : currentRuntime;
    },
    prepareRuntime: async () => { starts.push("prepare"); if (currentPrepareError) throw currentPrepareError; },
    startComponent: async (component) => {
      if (managed && running.has(component)) return;
      starts.push(component);
      if (component === currentFailComponent) throw currentComponentError ?? new Error("fake child failed");
      running.add(component);
    },
    stopComponents: async (components) => {
      const target = components ?? ["proxy", "dsh", "gateway"];
      stops.push(target);
      for (const component of target) running.delete(component);
    }
  });
  return {
    core, starts, stops, controller, running,
    setStatic: (value) => { currentStatic = value; },
    setRuntime: (value) => { currentRuntime = value; },
    setFailure: (component, error = null) => { currentFailComponent = component; currentComponentError = error; },
    setPrepareError: (error) => { currentPrepareError = error; }
  };
}

function failure(reasonCode, retryable = false) {
  const error = new Error(reasonCode);
  error.reasonCode = reasonCode;
  error.retryable = retryable;
  return error;
}

async function testLifecycleStates() {
  const ready = createCore();
  assert.equal(ready.core.snapshot().shell, "ready", "Shell state is independent from Agent Runtime state");
  const concurrent = await Promise.all([ready.core.ensureReady(), ready.core.ensureReady(), ready.core.ensureReady()]);
  assert.equal(concurrent.every((item) => item.status === "ready"), true);
  assert.deepEqual(ready.starts, ["prepare", "gateway", "dsh", "proxy"], "concurrent start shares one operation");
  assert.equal((await ready.core.ensureReady()).status, "ready", "ready start is idempotent");
  const beforeReadOnlyInspect = ready.core.snapshot();
  await ready.core.inspect({ readOnly: true });
  assert.deepEqual(ready.core.snapshot(), beforeReadOnlyInspect, "read-only inspect does not change Lifecycle state");

  const missingCredential = createCore({ runtimeResult: runtime({ credentialStatus: "missing" }) });
  assert.equal((await missingCredential.core.ensureReady()).status, "configuration_required");
  missingCredential.core.inspectRuntime = async () => runtime();
  assert.equal((await missingCredential.core.inspect()).status, "ready", "configured credential returns to ready without restart");

  const badConfig = createCore({ staticResult: { ok: false, reasonCode: "build_missing" } });
  assert.equal((await badConfig.core.ensureReady()).status, "configuration_required");
  assert.deepEqual(badConfig.starts, [], "build missing never prepares, installs, or starts a service");
  badConfig.core.inspectStatic = async () => ({ ok: true });
  assert.equal((await badConfig.core.ensureReady()).status, "ready", "configuration_required can start only after a new preflight passes");

  const failed = createCore({ failComponent: "dsh" });
  const failedState = await failed.core.ensureReady();
  assert.equal(failedState.status, "error");
  assert.equal(failedState.reasonCode, "runtime_start_failed");
  assert.equal(failedState.retryable, true);
}

async function testRetryabilityAndDegradedRecovery() {
  const ready = runtime();
  const dshUnavailable = { dsh: false, gateway: true, proxy: true, mcp: true, credentialStatus: "unknown", reasonCode: "dsh_unavailable" };
  const proxyUnhealthy = { dsh: true, gateway: true, proxy: false, mcp: true, credentialStatus: "configured", reasonCode: "runtime_health_failed" };
  const gatewayUnhealthy = { dsh: true, gateway: false, proxy: true, mcp: false, credentialStatus: "configured", reasonCode: "runtime_health_failed" };
  const value = createCore({ managed: true });
  await value.core.ensureReady();
  value.starts.length = 0;

  value.setRuntime(dshUnavailable);
  const beforeReadOnlyDegradedInspect = value.core.snapshot();
  const observedDsh = await value.core.inspect({ readOnly: true });
  assert.deepEqual({ status: observedDsh.status, reasonCode: observedDsh.reasonCode, retryable: observedDsh.retryable }, { status: "error", reasonCode: "runtime_degraded", retryable: true });
  assert.deepEqual(value.core.snapshot(), beforeReadOnlyDegradedInspect, "read-only degraded inspection does not alter Core state");
  assert.deepEqual(value.starts, [], "read-only degraded inspection does not restart Runtime");
  assert.deepEqual(value.stops, [], "read-only degraded inspection does not stop Runtime");
  value.setRuntime([dshUnavailable, ready]);
  await value.core.ensureReady();
  assert.deepEqual(value.stops.at(-1), ["proxy", "dsh"], "DSH degradation stops only dependent Agent services");
  assert.deepEqual(value.starts, ["prepare", "dsh", "proxy"], "DSH degradation restarts only stopped components");

  value.starts.length = 0;
  value.setRuntime([proxyUnhealthy, ready]);
  await value.core.ensureReady();
  assert.deepEqual(value.stops.at(-1), ["proxy"], "Proxy degradation stops only Proxy");
  assert.deepEqual(value.starts, ["prepare", "proxy"], "Proxy degradation restarts only Proxy");

  value.starts.length = 0;
  value.setRuntime([gatewayUnhealthy, ready]);
  await value.core.ensureReady();
  assert.deepEqual(value.stops.at(-1), ["proxy", "dsh", "gateway"], "Gateway degradation stops its dependents and Gateway");
  assert.deepEqual(value.starts, ["prepare", "gateway", "dsh", "proxy"], "Gateway degradation restores dependency order");

  value.starts.length = 0;
  value.setRuntime([dshUnavailable, ready]);
  const concurrent = await Promise.all([value.core.ensureReady(), value.core.ensureReady(), value.core.ensureReady()]);
  assert.equal(concurrent.every((state) => state.status === "ready"), true);
  assert.deepEqual(value.starts, ["prepare", "dsh", "proxy"], "concurrent degraded starts share one Lifecycle operation");
}

async function testFailurePreservationAndClassification() {
  const recoveryFailure = createCore({ failComponent: "dsh" });
  const recoveryState = await recoveryFailure.core.ensureReady({ recovering: true });
  assert.deepEqual({ status: recoveryState.status, reasonCode: recoveryState.reasonCode, retryable: recoveryState.retryable }, { status: "error", reasonCode: "recovery_failed", retryable: true });
  recoveryFailure.setRuntime({ dsh: false, gateway: true, proxy: false, mcp: true, credentialStatus: "unknown", reasonCode: "dsh_unavailable" });
  const observedRecoveryFailure = await recoveryFailure.core.inspect({ readOnly: true });
  assert.deepEqual({ status: observedRecoveryFailure.status, reasonCode: observedRecoveryFailure.reasonCode, retryable: observedRecoveryFailure.retryable }, { status: "error", reasonCode: "recovery_failed", retryable: true }, "read-only status preserves recovery failure when DSH is offline");

  const retry = createCore({ failComponent: "dsh", managed: true });
  await retry.core.ensureReady();
  retry.starts.length = 0;
  retry.setFailure(null);
  retry.setRuntime([{ dsh: false, gateway: true, proxy: false, mcp: true, credentialStatus: "unknown", reasonCode: "dsh_unavailable" }, runtime()]);
  const retried = await retry.core.ensureReady();
  assert.equal(retried.status, "ready");
  assert.deepEqual(retry.starts, ["prepare", "dsh", "proxy"], "retryable failure executes a new managed Lifecycle operation");

  const portConflict = createCore({ failComponent: "gateway", componentError: failure("port_conflict") });
  const portState = await portConflict.core.ensureReady();
  assert.deepEqual({ status: portState.status, reasonCode: portState.reasonCode, retryable: portState.retryable }, { status: "error", reasonCode: "port_conflict", retryable: false });

  const ownership = createCore({ prepareError: failure("runtime_ownership_conflict") });
  const ownershipState = await ownership.core.ensureReady();
  assert.deepEqual({ status: ownershipState.status, reasonCode: ownershipState.reasonCode, retryable: ownershipState.retryable }, { status: "error", reasonCode: "runtime_ownership_conflict", retryable: false });

  const config = createCore({ staticResult: { ok: false, reasonCode: "build_missing" } });
  const configState = await config.core.ensureReady();
  assert.deepEqual({ status: configState.status, retryable: configState.retryable }, { status: "configuration_required", retryable: false });

  const missingCredential = createCore({ runtimeResult: runtime({ credentialStatus: "missing" }) });
  const credentialState = await missingCredential.core.ensureReady();
  assert.deepEqual({ status: credentialState.status, reasonCode: credentialState.reasonCode, retryable: credentialState.retryable }, { status: "configuration_required", reasonCode: "credential_missing", retryable: false });

  const invalidModel = createCore({ runtimeResult: runtime({ agentConfigurationStatus: "invalid" }) });
  const invalidModelState = await invalidModel.core.ensureReady();
  assert.deepEqual({ status: invalidModelState.status, reasonCode: invalidModelState.reasonCode, retryable: invalidModelState.retryable }, { status: "configuration_required", reasonCode: "agent_configuration_invalid", retryable: false });
}

async function testRecoveryAndGeneration() {
  const value = createCore();
  await value.core.ensureReady();
  value.starts.length = 0;
  await value.core.handleProcessExit({ component: "proxy", generation: 1, intentional: false });
  assert.equal(value.core.snapshot().status, "ready", "unexpected child exit recovers through the same core");
  assert.deepEqual(value.starts, ["prepare", "gateway", "dsh", "proxy"]);
  value.starts.length = 0;
  value.controller.get = () => ({ generation: 2 });
  await value.core.handleProcessExit({ component: "dsh", generation: 1, intentional: false });
  assert.deepEqual(value.starts, [], "stale generation exit cannot change current state");
  value.controller.get = () => ({ generation: 1 });
  value.starts.length = 0;
  value.stops.length = 0;
  await value.core.handleProcessExit({ component: "gateway", generation: 1, intentional: false });
  assert.deepEqual(value.stops, [["proxy", "dsh"]], "Gateway recovery stops only dependent Agent services");
  assert.deepEqual(value.starts, ["prepare", "gateway", "dsh", "proxy"]);
}

async function testShutdownDuringStart() {
  let releasePrepare;
  const starts = [];
  const stops = [];
  const core = new RuntimeLifecycleCore({
    controller: { get: () => ({ generation: 1 }) },
    inspectStatic: async () => ({ ok: true }),
    inspectRuntime: async () => runtime(),
    prepareRuntime: async () => { starts.push("prepare"); await new Promise((resolve) => { releasePrepare = resolve; }); },
    startComponent: async (component) => { starts.push(component); },
    stopComponents: async () => { stops.push("agent"); }
  });
  const starting = core.ensureReady();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(core.snapshot().retryable, false, "starting is never retryable");
  const stopping = core.stopForShutdown();
  releasePrepare();
  await Promise.all([starting, stopping]);
  assert.deepEqual(starts, ["prepare"], "shutdown barrier prevents the next Runtime component from starting");
  assert.deepEqual(stops, ["agent"], "shutdown still stops confirmed Runtime components");
  assert.equal((await core.ensureReady()).status, "shutting_down", "shutdown refuses a new Lifecycle start");
}

async function testSupervisorLock() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-supervisor-lock-"));
  const lockPath = path.join(root, "supervisor-lock.json");
  await writeFile(lockPath, JSON.stringify({ pid: 99999999, instanceId: "dead" }));
  const release = await acquireSupervisorLock({ lockPath, instanceId: "new" });
  await assert.rejects(() => acquireSupervisorLock({ lockPath, instanceId: "other" }), /ownership|运行/);
  await release();
}

async function testOrphanMetadataFailsClosed() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-supervisor-orphan-"));
  const metadataPath = path.join(root, "managed-processes.json");
  await writeFile(metadataPath, JSON.stringify({ processes: [{ component: "dsh", pid: process.pid, managedState: "running" }] }));
  await assert.rejects(() => assertNoLiveManagedOrphans(metadataPath), /拒绝接管或终止/);
}

async function testControllerShutdown() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-controller-shutdown-"));
  const metadataPath = path.join(root, "managed-processes.json");
  const lockPath = path.join(root, "supervisor-lock.json");
  const releaseLock = await acquireSupervisorLock({ lockPath, instanceId: "test" });
  const children = [];
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.pid = 4000 + children.length;
    child.exitCode = null;
    child.kill = () => { child.exitCode = 0; queueMicrotask(() => child.emit("exit", 0, "SIGTERM")); return true; };
    children.push(child);
    return child;
  };
  const events = [];
  const controller = new ManagedProcessController({ supervisorInstanceId: "test", metadataPath, spawnImpl, platform: "darwin", onProcessEvent: (event) => events.push(event) });
  for (const component of ["assetHub", "gateway", "dsh", "proxy"]) await controller.start(component, { command: "node", args: [], cwd: process.cwd(), env: process.env });
  controller.scheduleRestart("dsh", () => { throw new Error("shutdown restart timer was not cancelled"); }, 5);
  const firstShutdown = controller.stopAll(["proxy", "dsh", "gateway", "assetHub"]);
  const secondShutdown = controller.stopAll(["proxy", "dsh", "gateway", "assetHub"]);
  await Promise.all([firstShutdown, secondShutdown]);
  await new Promise((resolve) => setTimeout(resolve, 15));
  controller.assertAllExited();
  assert.equal(events.filter((event) => event.type === "exit").length, 4, "each confirmed child exits exactly once during repeated shutdown");
  assert.equal(controller.restartTimers.size, 0, "shutdown cancels all restart timers");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  assert.equal(metadata.version, 3, "managed process metadata is v3");
  assert.equal(metadata.processes.every((record) => record.managedState === "exited" && record.running === false), true, "final metadata accurately records exited processes");
  await readFile(lockPath, "utf8");
  await releaseLock();
  await rm(root, { recursive: true, force: true });
}

async function testMetadataPersistence() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-controller-metadata-"));
  const metadataPath = path.join(root, "managed-processes.json");
  const children = [];
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.pid = 5000 + children.length;
    child.exitCode = null;
    child.kill = () => { child.exitCode = 0; queueMicrotask(() => child.emit("exit", 0, "SIGTERM")); return true; };
    children.push(child);
    return child;
  };
  const persistenceErrors = [];
  const controller = new ManagedProcessController({ supervisorInstanceId: "test", metadataPath, spawnImpl, platform: "darwin", onPersistenceError: (error) => persistenceErrors.push(error) });
  await Promise.all(["gateway", "dsh", "proxy"].map((component) => controller.start(component, { command: "node", args: [], cwd: process.cwd(), env: process.env })));
  for (const child of children) { child.exitCode = 0; child.emit("exit", 0, "SIGTERM"); }
  await controller.flushMetadata();
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  assert.equal(metadata.processes.every((record) => record.managedState === "exited" && record.running === false), true, "concurrent exit persistence is serialized and ordered");
  assert.deepEqual(persistenceErrors, []);

  const failingChildren = [];
  const failingSpawn = () => {
    const child = new EventEmitter();
    child.pid = 6000 + failingChildren.length;
    child.exitCode = null;
    child.kill = () => true;
    failingChildren.push(child);
    return child;
  };
  const failingRoot = await mkdtemp(path.join(os.tmpdir(), "ued-controller-persist-failure-"));
  const failingController = new ManagedProcessController({ supervisorInstanceId: "test", metadataPath: path.join(failingRoot, "managed-processes.json"), spawnImpl: failingSpawn, platform: "darwin", onPersistenceError: (error) => persistenceErrors.push(error) });
  await failingController.start("dsh", { command: "node", args: [], cwd: process.cwd(), env: process.env });
  failingController.fileSystem = { writeFile: async () => { throw new Error("test persistence failure"); }, rename };
  let unhandled = null;
  const observeUnhandled = (error) => { unhandled = error; };
  process.once("unhandledRejection", observeUnhandled);
  failingChildren[0].exitCode = 0;
  failingChildren[0].emit("exit", 0, "SIGTERM");
  await new Promise((resolve) => setImmediate(resolve));
  process.removeListener("unhandledRejection", observeUnhandled);
  assert.equal(unhandled, null, "exit persistence failure never becomes an unhandled rejection");
  assert.equal(persistenceErrors.length > 0, true, "exit persistence failure is reported to Supervisor");
  await rm(failingRoot, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
}

async function testSharedShutdownPromise() {
  let calls = 0;
  const shutdown = createSharedShutdown(async () => { calls += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return "done"; });
  const [first, second, third] = await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT"), shutdown("SIGTERM")]);
  assert.equal(calls, 1, "repeated shutdown calls share one teardown chain");
  assert.deepEqual([first, second, third], ["done", "done", "done"]);
}

async function testRuntimePathSafety() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-runtime-supervisor-"));
  const dataDir = path.join(root, "data");
  const runtimeDir = path.join(root, "runtime");
  await mkdir(dataDir);
  const before = await readdir(root);
  const inspected = await inspectRuntimePaths({ dataDir, agentRuntimeDir: runtimeDir });
  assert.equal(inspected.initializationRequired, true);
  assert.deepEqual(await readdir(root), before, "inspect creates no files or directories");
  const ensured = await ensureRuntimePaths({ dataDir, agentRuntimeDir: runtimeDir });
  assert.ok(ensured.directories.logs);
  await rm(path.join(runtimeDir, "logs"), { recursive: true });
  await symlink(dataDir, path.join(runtimeDir, "logs"), "dir");
  await assert.rejects(() => inspectRuntimePaths({ dataDir, agentRuntimeDir: runtimeDir }), /符号链接|DATA_DIR/);
}

async function testWindowsAdapterOwnershipAndForcedStop() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-windows-adapter-"));
  const metadataPath = path.join(root, "managed-processes.json");
  const child = new EventEmitter();
  child.pid = 72001;
  child.exitCode = null;
  const observation = () => child.exitCode === null
    ? { pid: 72001, processCreationTime: "2026-08-30T01:00:00.000Z", executablePath: "C:\\Program Files\\nodejs\\node.exe", commandLine: "node fixture.mjs", parentPid: 70000 }
    : null;
  const jobHelper = {
    spawn: async () => { child.jobOwnership = { provider: "test", helperVersion: 1, helperSha256: "test", helperPid: 72000, helperCreationTime: "now", jobInstanceId: "job-a", killOnJobClose: true, rootAssigned: true, assignedAt: "now" }; return child; },
    activeProcessCount: async () => 0,
    terminate: async () => { child.exitCode = 1; queueMicrotask(() => child.emit("exit", 1, null)); },
    shutdown: () => {}
  };
  const adapter = new WindowsProcessAdapter({
    jobHelper,
    inspectProcess: async () => observation(),
    requestGraceful: async () => ({ acknowledged: false, reasonCode: "graceful_pipe_unavailable" })
  });
  const events = [];
  const controller = new ManagedProcessController({ supervisorInstanceId: "supervisor-a", runtimeInstanceId: "runtime-a", metadataPath, platform: "win32", adapter, onProcessEvent: (event) => events.push(event) });
  await controller.start("fixture", { command: "node", args: ["fixture.mjs"], cwd: root, env: {} });
  const record = controller.get("fixture");
  assert.equal(record.platform, "win32");
  assert.equal(record.processCreationTime, "2026-08-30T01:00:00.000Z");
  assert.equal(record.executablePath, "c:\\program files\\nodejs\\node.exe");
  await controller.stop("fixture", { timeoutMs: 1 });
  assert.equal(events.some((event) => event.type === "graceful_shutdown_failed" && event.reasonCode === "graceful_pipe_unavailable"), true, "Windows does not pretend SIGTERM is graceful shutdown");
  assert.equal(events.some((event) => event.type === "exit"), true, "forced stop waits for a real child exit");
  await rm(root, { recursive: true, force: true });
}

async function testWindowsJobConvergenceWaitsAndRecordsFailure() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-windows-job-convergence-"));
  const metadataPath = path.join(root, "managed-processes.json");
  const child = new EventEmitter();
  child.pid = 72501;
  child.exitCode = null;
  const counts = [2, 1, 0, 0, 0];
  let queryCount = 0;
  let portChecks = 0;
  const jobHelper = {
    spawn: async () => { child.jobOwnership = { jobInstanceId: "job-convergence", rootAssigned: true }; return child; },
    activeProcessCount: async () => { queryCount += 1; return counts.shift() ?? 0; },
    terminate: async () => {},
    shutdown: () => {}
  };
  const adapter = new WindowsProcessAdapter({ jobHelper, inspectProcess: async () => null, requestGraceful: async () => {
    child.exitCode = 0;
    queueMicrotask(() => child.emit("exit", 0, null));
    return { acknowledged: true };
  } });
  const events = [];
  const controller = new ManagedProcessController({ supervisorInstanceId: "supervisor-a", runtimeInstanceId: "runtime-a", metadataPath, platform: "win32", adapter, onProcessEvent: (event) => events.push(event) });
  await controller.start("dsh", { command: "node", args: ["fixture.mjs"], cwd: root, env: {}, convergence: { verify: async () => {
    portChecks += 1;
    if (portChecks < 3) {
      const error = new Error("fixture port remains occupied");
      error.reasonCode = "managed_component_port_not_released";
      throw error;
    }
  } } });
  await controller.stop("dsh", { convergenceTimeoutMs: 1_000 });
  assert.equal(queryCount, 5, "Windows shutdown waits for owned Job descendants and port release");
  assert.equal(portChecks, 3, "component port is checked after Job convergence until it is released");
  assert.equal(controller.get("dsh").convergence.activeProcessCount, 0);
  assert.equal(controller.get("dsh").convergence.verifiedAt !== null, true);

  const stuckChild = new EventEmitter();
  stuckChild.pid = 72502;
  stuckChild.exitCode = null;
  const stuckAdapter = new WindowsProcessAdapter({
    jobHelper: { spawn: async () => { stuckChild.jobOwnership = { jobInstanceId: "job-stuck", rootAssigned: true }; return stuckChild; }, activeProcessCount: async () => 1, terminate: async () => {}, shutdown: () => {} },
    inspectProcess: async () => null,
    requestGraceful: async () => { stuckChild.exitCode = 0; queueMicrotask(() => stuckChild.emit("exit", 0, null)); return { acknowledged: true }; }
  });
  const stuckController = new ManagedProcessController({ supervisorInstanceId: "supervisor-a", runtimeInstanceId: "runtime-a", metadataPath, platform: "win32", adapter: stuckAdapter, onProcessEvent: (event) => events.push(event) });
  await stuckController.start("dsh", { command: "node", args: ["fixture.mjs"], cwd: root, env: {} });
  await assert.rejects(() => stuckController.stop("dsh", { convergenceTimeoutMs: 20 }), /identity-verified Windows component/);
  const failure = events.findLast((event) => event.type === "safe_fallback_failed");
  assert.equal(failure.reasonCode, "windows_job_not_empty", "bounded timeout reports the owned Job state without weakening the check");
  const saved = JSON.parse(await readFile(metadataPath, "utf8"));
  assert.equal(saved.processes[0].convergence.activeProcessCount, 1, "failed convergence evidence is persisted");
  assert.equal(saved.processes[0].convergence.failureReasonCode, "windows_job_not_empty");
  assert.equal(saved.processes[0].convergence.fallback, undefined, "unverified ownership cannot create a fallback record");
  await rm(root, { recursive: true, force: true });
}

async function testWindowsOwnedJobFallbackIsDistinctAndBounded() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-windows-owned-job-fallback-"));
  const metadataPath = path.join(root, "managed-processes.json");
  const child = new EventEmitter();
  child.pid = 72503;
  child.exitCode = null;
  const helper = new EventEmitter();
  helper.pid = 82503;
  helper.exitCode = null;
  helper.stdin = { writable: true };
  const jobInstanceId = "f3f25c89-eec9-4489-83e9-efb0d91ad4a7";
  child.helper = helper;
  child.jobOwnership = { provider: "ued-windows-job-helper", helperVersion: 1, helperSha256: "a".repeat(64), helperPath: "C:\\tools\\ued-windows-job-helper.exe", helperPid: helper.pid, supervisorPid: process.pid, jobInstanceId, killOnJobClose: true, rootAssigned: true };
  const counts = [1, 0];
  let helperExitResolve;
  child.helperExitPromise = new Promise((resolve) => { helperExitResolve = resolve; });
  const jobHelper = {
    spawn: async () => child,
    verifyHelper: async () => ({ version: 1, architecture: "x64", sha256: "a".repeat(64) }),
    terminate: async () => {},
    activeProcessCount: async () => counts.shift() ?? 0,
    shutdown: () => { helper.exitCode = 0; helperExitResolve({ code: 0, signal: null }); },
    waitForHelperExit: async () => child.helperExitPromise
  };
  const inspectProcess = async (pid) => {
    if (pid === child.pid && child.exitCode !== null) return null;
    if (pid === child.pid) return { pid, processCreationTime: "root-created", executablePath: "C:\\tools\\node.exe", commandLine: '"C:\\tools\\node.exe" fixture.mjs', parentPid: helper.pid };
    if (pid === helper.pid) return { pid, processCreationTime: "helper-created", executablePath: child.jobOwnership.helperPath, commandLine: `"${child.jobOwnership.helperPath}" --supervisor-pid ${process.pid} --supervisor-instance-id supervisor-safe --runtime-instance-id runtime-safe --generation 1 --job-instance-id ${jobInstanceId} --component dsh`, parentPid: process.pid };
    return null;
  };
  const adapter = new WindowsProcessAdapter({ jobHelper, inspectProcess, requestGraceful: async () => {
    child.exitCode = 0;
    queueMicrotask(() => child.emit("exit", 0, null));
    return { acknowledged: true };
  } });
  const events = [];
  const controller = new ManagedProcessController({ supervisorInstanceId: "supervisor-safe", runtimeInstanceId: "runtime-safe", metadataPath, platform: "win32", adapter, onProcessEvent: (event) => events.push(event) });
  await controller.start("dsh", { command: "C:\\tools\\node.exe", args: ["fixture.mjs"], cwd: root, env: {}, windowsJobHelper: { path: child.jobOwnership.helperPath, manifestPath: `${child.jobOwnership.helperPath}.manifest.json` }, convergence: { verify: async () => {} } });
  await controller.stop("dsh", { convergenceTimeoutMs: 20 });
  const saved = JSON.parse(await readFile(metadataPath, "utf8"));
  const record = saved.processes[0];
  assert.equal(record.graceful.outcome, "accepted", "the accepted cooperative request stays separately recorded");
  assert.equal(record.convergence.fallback.used, true, "owned Job fallback is explicit");
  assert.equal(record.convergence.fallback.outcome, "completed");
  assert.equal(record.convergence.fallback.activeProcessCountAfter, 0);
  assert.equal(record.convergence.portsReleased, true);
  assert.equal(record.jobOwnership.helperExited, true);
  assert.equal(events.some((event) => event.type === "safe_fallback_completed"), true);
  await rm(root, { recursive: true, force: true });
}

async function testWindowsBootstrapSpecifierContract() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-windows-bootstrap-"));
  const bootstrapPath = path.join(root, "中文 bootstrap path", "windows-graceful-bootstrap.mjs");
  const calls = [];
  const helperProcess = new EventEmitter();
  helperProcess.pid = 77000;
  helperProcess.stdout = new EventEmitter();
  helperProcess.stdin = { writable: true, write: () => true };
  const client = new WindowsJobHelperClient({
    verifyHelper: async () => ({ version: 1, architecture: "x64", sha256: "a".repeat(64) }),
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      queueMicrotask(() => helperProcess.stdout.emit("data", Buffer.from('{"event":"spawned","pid":77001}\n')));
      return helperProcess;
    }
  });
  const adapter = new WindowsProcessAdapter({ bootstrapPath, jobHelper: client, inspectProcess: async () => null });
  await adapter.spawn({
    command: "C:\\Program Files\\nodejs\\node.exe",
    args: ["fixture.mjs", "argument with spaces"],
    cwd: root,
    env: {},
    windowsJobHelper: { path: "C:\\helpers\\ued-windows-job-helper.exe", sha256: "a".repeat(64) }
  }, { component: "dsh", supervisorInstanceId: "supervisor-a", runtimeInstanceId: "runtime-a", generation: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.shell, false, "Windows Job Helper client remains shell-free");
  const separator = calls[0].args.indexOf("--");
  assert.notEqual(separator, -1);
  assert.deepEqual(calls[0].args.slice(separator + 1), ["C:\\Program Files\\nodejs\\node.exe", "--import", pathToFileURL(bootstrapPath).href, "fixture.mjs", "argument with spaces"], "bootstrap uses a file URL while child argv remains structured");
  assert.notEqual(calls[0].args[separator + 3], bootstrapPath, "raw filesystem bootstrap path is never passed to --import");
  await rm(root, { recursive: true, force: true });
}

async function testWindowsJobHelperQueryFailureClassification() {
  async function createFixture(response) {
    const helper = new EventEmitter();
    let helperSpawnOptions;
    helper.pid = 77100;
    helper.exitCode = null;
    helper.signalCode = null;
    helper.stdout = new EventEmitter();
    helper.stdin = {
      writable: true,
      write(line) {
        if (!line.startsWith("query ")) return true;
        queueMicrotask(() => {
          if (response.event === "helper-exit") {
            helper.exitCode = response.code;
            helper.emit("exit", response.code, response.signal ?? null);
          } else {
            helper.stdout.emit("data", Buffer.from(`${JSON.stringify(response)}\n`));
          }
        });
        return true;
      }
    };
    const client = new WindowsJobHelperClient({
      verifyHelper: async () => ({ version: 1, architecture: "x64", sha256: "a".repeat(64) }),
      spawnImpl: (_path, _args, options) => {
        helperSpawnOptions = options;
        queueMicrotask(() => helper.stdout.emit("data", Buffer.from('{"event":"spawned","pid":77101}\n')));
        return helper;
      }
    });
    const binding = { component: "dsh", supervisorInstanceId: "supervisor-a", runtimeInstanceId: "runtime-a", generation: 1 };
    const child = await client.spawn({ command: "node", args: ["fixture.mjs"], cwd: os.tmpdir(), env: {}, windowsJobHelper: { path: "C:\\helpers\\job.exe", sha256: "a".repeat(64) } }, binding);
    return { client, record: { child, jobOwnership: child.jobOwnership, ...binding }, helperSpawnOptions };
  }

  const queryFailure = await createFixture({ event: "job-query-failed", value: 5 });
  assert.equal(queryFailure.helperSpawnOptions.detached, true, "Windows Job Helper must not share Supervisor console control events.");
  await assert.rejects(() => queryFailure.client.activeProcessCount(queryFailure.record), (error) => error.reasonCode === "windows_job_query_failed" && error.win32ErrorCode === 5);

  const helperExit = await createFixture({ event: "helper-exit", code: 73 });
  await assert.rejects(() => helperExit.client.activeProcessCount(helperExit.record), (error) => error.reasonCode === "windows_job_helper_exited" && error.helperExitCode === 73);
  assert.equal(helperExit.record.child.jobOwnership.helperExitCode, 73);

  const rejected = await createFixture({ event: "protocol-rejected" });
  await assert.rejects(() => rejected.client.activeProcessCount(rejected.record), (error) => error.reasonCode === "windows_job_protocol_rejected");
  rejected.record.child.helper.stdin.writable = false;
  assert.throws(() => rejected.client.request(rejected.record, "query"), (error) => error.reasonCode === "windows_job_pipe_unavailable");
}

async function testWindowsProcessIdentityProbeBindsPid() {
  const calls = [];
  const process = new EventEmitter();
  process.stdout = new EventEmitter();
  const adapter = new WindowsProcessAdapter({
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      queueMicrotask(() => {
        process.stdout.emit("data", Buffer.from('{"pid":78001,"creationTime":"creation-a","executablePath":"C:\\\\node.exe","commandLine":"node fixture.mjs","parentPid":1}\n'));
        process.emit("exit", 0);
      });
      return process;
    }
  });
  const observed = await adapter.inspectProcess(78001);
  assert.deepEqual(observed, { pid: 78001, processCreationTime: "creation-a", executablePath: "C:\\node.exe", commandLine: "node fixture.mjs", parentPid: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "powershell.exe");
  assert.equal(calls[0].args.at(-1).includes("ProcessId = 78001"), true, "CIM filter receives the validated PID inside its command");
  assert.equal(calls[0].args.includes("78001"), false, "CIM probe does not pass an unbound trailing PID argument");
  assert.equal(calls[0].options.shell, false, "identity probe remains shell-free");
}

async function testWindowsIdentityMismatchFailsClosed() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-windows-identity-"));
  const child = new EventEmitter();
  child.pid = 73001;
  child.exitCode = null;
  const baseline = { pid: 73001, processCreationTime: "creation-a", executablePath: "C:\\node.exe", commandLine: "node fixture.mjs", parentPid: 1 };
  let observed = baseline;
  const adapter = new WindowsProcessAdapter({ jobHelper: { spawn: async () => { child.jobOwnership = { jobInstanceId: "job-b", rootAssigned: true }; return child; }, activeProcessCount: async () => 0, terminate: async () => {}, shutdown: () => {} }, inspectProcess: async () => observed, requestGraceful: async () => ({ acknowledged: false }) });
  const controller = new ManagedProcessController({ supervisorInstanceId: "supervisor-a", runtimeInstanceId: "runtime-a", platform: "win32", adapter });
  await controller.start("fixture", { command: "node", args: ["fixture.mjs"], cwd: root, env: {} });
  const record = controller.get("fixture");
  for (const [field, value, reason] of [["processCreationTime", "creation-b", "process_creation_time_mismatch"], ["executablePath", "C:\\other.exe", "executable_mismatch"], ["commandLine", "node other.mjs", "command_fingerprint_mismatch"]]) {
    observed = { ...baseline, [field]: value };
    const inspection = await adapter.inspect(record);
    assert.deepEqual({ alive: inspection.alive, ownership: inspection.ownership, reasonCode: inspection.reasonCode }, { alive: true, ownership: "unknown", reasonCode: reason });
  }
  record.supervisorInstanceId = "supervisor-b";
  await assert.rejects(() => controller.stop("fixture"), /Supervisor ownership/);
  record.supervisorInstanceId = "supervisor-a";
  record.runtimeInstanceId = "runtime-b";
  await assert.rejects(() => controller.stop("fixture"), /Runtime ownership/);
  record.runtimeInstanceId = "runtime-a";
  observed = baseline;
  record.generation = 2;
  await assert.rejects(() => controller.stop("fixture"), /generation/);
  await rm(root, { recursive: true, force: true });
}

async function testWindowsStoredPidReuseFailsClosed() {
  const adapter = new WindowsProcessAdapter({ inspectProcess: async () => ({ pid: 74001, processCreationTime: "new", executablePath: "C:\\node.exe", commandLine: "node fixture.mjs", parentPid: 1 }) });
  const inspection = await adapter.inspectStoredProcess({ component: "fixture", pid: 74001, processCreationTime: "old", executablePath: "C:\\node.exe", commandFingerprint: "not-the-new-command", supervisorInstanceId: "supervisor-a", runtimeInstanceId: "runtime-a", generation: 1 });
  assert.deepEqual({ alive: inspection.alive, ownership: inspection.ownership, reasonCode: inspection.reasonCode }, { alive: true, ownership: "unknown", reasonCode: "process_creation_time_mismatch" }, "PID reuse is never reclaimed automatically");
}

async function testWindowsJobOwnershipFailsClosed() {
  const child = new EventEmitter(); child.pid = 76001; child.exitCode = null;
  const adapter = new WindowsProcessAdapter({ jobHelper: { spawn: async () => child, activeProcessCount: async () => 0, terminate: async () => { throw new Error("must not terminate without Job ownership"); }, shutdown: () => {} }, inspectProcess: async () => ({ pid: 76001, processCreationTime: "a", executablePath: "C:\\node.exe", commandLine: "node fixture.mjs", parentPid: 1 }), requestGraceful: async () => ({ acknowledged: false }) });
  const controller = new ManagedProcessController({ supervisorInstanceId: "supervisor-a", runtimeInstanceId: "runtime-a", platform: "win32", adapter });
  await controller.start("fixture", { command: "node", args: ["fixture.mjs"], cwd: os.tmpdir(), env: {} });
  await assert.rejects(() => controller.stop("fixture", { timeoutMs: 0 }), /Job ownership is unavailable/, "Windows never falls back to taskkill when Job ownership is unavailable");
}

async function testGracefulPipeCapability() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-graceful-pipe-"));
  const endpoint = process.platform === "win32"
    ? `\\\\.\\pipe\\ued-asset-hub-graceful-test-${process.pid}-${Date.now()}`
    : path.join(root, "graceful.sock");
  let calls = 0;
  const capability = createGracefulCapability({ endpoint, token: "t".repeat(32), runtimeInstanceId: "runtime-a", component: "dsh", generation: 4, onShutdown: () => { calls += 1; } });
  await capability.start();
  const accepted = await requestGracefulCapability({ endpoint, token: "t".repeat(32), runtimeInstanceId: "runtime-a", component: "dsh", generation: 4 });
  assert.deepEqual(accepted, { acknowledged: true, reasonCode: null }, "graceful pipe accepts only its bound capability");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1, "graceful capability is one-shot");
  const replay = await requestGracefulCapability({ endpoint, token: "t".repeat(32), runtimeInstanceId: "runtime-a", component: "dsh", generation: 4 });
  assert.equal(replay.acknowledged, false, "closed capability rejects replay");
  await rm(root, { recursive: true, force: true });
}

async function testWindowsSupervisorCrashFailsClosed() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-windows-crash-"));
  const metadataPath = path.join(root, "managed-processes.json");
  const processRecord = { component: "fixture", pid: 75001, processCreationTime: "creation-a", executablePath: "C:\\node.exe", commandLine: "node fixture.mjs", parentPid: 1 };
  const adapter = new WindowsProcessAdapter({ inspectProcess: async () => processRecord });
  const fingerprint = (await adapter.captureIdentity({ child: { pid: 75001 }, specification: { command: "node", args: [], cwd: root }, supervisorInstanceId: "previous-supervisor", runtimeInstanceId: "previous-runtime", generation: 1 })).commandFingerprint;
  await writeFile(metadataPath, JSON.stringify({ version: 2, processes: [{ component: "fixture", pid: 75001, processCreationTime: "creation-a", executablePath: "C:\\node.exe", commandFingerprint: fingerprint, supervisorInstanceId: "previous-supervisor", runtimeInstanceId: "previous-runtime", generation: 1, managedState: "running" }] }));
  await assert.rejects(() => assertNoLiveManagedOrphans(metadataPath, { adapter }), /拒绝接管或终止/, "a new Supervisor neither kills nor replaces a surviving previous tree");
  await rm(root, { recursive: true, force: true });
}

await testLifecycleStates();
await testRetryabilityAndDegradedRecovery();
await testFailurePreservationAndClassification();
await testRecoveryAndGeneration();
await testShutdownDuringStart();
await testControllerShutdown();
await testMetadataPersistence();
await testSharedShutdownPromise();
await testRuntimePathSafety();
await testSupervisorLock();
await testOrphanMetadataFailsClosed();
await testWindowsAdapterOwnershipAndForcedStop();
await testWindowsJobConvergenceWaitsAndRecordsFailure();
await testWindowsJobHelperQueryFailureClassification();
await testWindowsOwnedJobFallbackIsDistinctAndBounded();
await testWindowsBootstrapSpecifierContract();
await testWindowsProcessIdentityProbeBindsPid();
await testWindowsIdentityMismatchFailsClosed();
await testWindowsStoredPidReuseFailsClosed();
await testWindowsJobOwnershipFailsClosed();
await testGracefulPipeCapability();
await testWindowsSupervisorCrashFailsClosed();
console.log("[UED Agent] Runtime Supervisor foundation checks passed.");
