import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ManagedProcessController, assertNoLiveManagedOrphans } from "./managed-process-controller.mjs";
import { RuntimeLifecycleCore } from "./runtime-lifecycle-core.mjs";
import { ensureRuntimePaths, inspectRuntimePaths } from "./runtime-path-safety.mjs";
import { acquireSupervisorLock } from "./supervisor-lock.mjs";
import { createSharedShutdown } from "./host-supervisor.mjs";

function runtime({ credentialStatus = "configured" } = {}) {
  return { dsh: true, gateway: true, proxy: true, mcp: true, credentialStatus };
}

function createCore({ staticResult = { ok: true }, runtimeResult = runtime(), failComponent = null } = {}) {
  const starts = [];
  const stops = [];
  const controller = { get: () => ({ generation: 1 }) };
  const core = new RuntimeLifecycleCore({
    controller,
    inspectStatic: async () => staticResult,
    inspectRuntime: async () => runtimeResult,
    prepareRuntime: async () => { starts.push("prepare"); },
    startComponent: async (component) => { starts.push(component); if (component === failComponent) throw new Error("fake child failed"); },
    stopComponents: async (components) => { stops.push(components ?? ["proxy", "dsh", "gateway"]); }
  });
  return { core, starts, stops, controller };
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
  assert.equal((await failed.core.ensureReady()).status, "error");
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
  const stopping = core.stopForShutdown();
  releasePrepare();
  await Promise.all([starting, stopping]);
  assert.deepEqual(starts, ["prepare"], "shutdown barrier prevents the next Runtime component from starting");
  assert.deepEqual(stops, ["agent"], "shutdown still stops confirmed Runtime components");
  assert.equal((await core.ensureReady()).status, "starting", "shutdown refuses a new Lifecycle start");
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

await testLifecycleStates();
await testRecoveryAndGeneration();
await testShutdownDuringStart();
await testControllerShutdown();
await testMetadataPersistence();
await testSharedShutdownPromise();
await testRuntimePathSafety();
await testSupervisorLock();
await testOrphanMetadataFailsClosed();
console.log("[UED Agent] Runtime Supervisor foundation checks passed.");
