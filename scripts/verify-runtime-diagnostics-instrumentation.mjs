import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createBoundedNdjsonWriter } from "./bounded-ndjson-writer.mjs";
import { ManagedProcessController } from "./managed-process-controller.mjs";
import { createRuntimeDiagnosticsState } from "./runtime-diagnostics-state.mjs";
import { RuntimeLifecycleCore } from "./runtime-lifecycle-core.mjs";

const operationId = "123e4567-e89b-42d3-a456-426614174000";
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "asset-hub-runtime-diagnostics-"));

try {
  const diagnostics = createRuntimeDiagnosticsState({ now: () => "2026-08-30T00:00:00.000Z", supervisorStartedAt: "2026-08-30T00:00:00.000Z" });
  assert.equal(diagnostics.recordManagedEvent({ type: "started", component: "gateway", generation: 1, pid: 41001, ownership: "owned", operation: "initial_start", operationId }), true);
  const staleToken = diagnostics.beginHealthProbe("gateway");
  const versionBeforeStaleResult = diagnostics.snapshot().snapshotVersion;
  assert.equal(diagnostics.recordManagedEvent({ type: "exit", component: "gateway", generation: 1, code: 1, signal: null, intentional: false, operation: "process_restart", operationId }), true);
  assert.equal(diagnostics.acceptHealthProbe(staleToken, { health: "healthy" }), false, "stale health result must be ignored");
  assert.equal(diagnostics.snapshot().snapshotVersion, versionBeforeStaleResult + 1, "a stale result cannot mutate the snapshot");
  assert.equal(diagnostics.recordRecovery({ type: "started", operationId, startedAt: "2026-08-30T00:00:01.000Z", generation: 2 }), true);
  assert.equal(diagnostics.recordRecovery({ type: "completed", operationId, completedAt: "2026-08-30T00:00:02.000Z", outcome: "failed", generation: 2 }), true);
  diagnostics.beginShutdown();
  assert.equal(diagnostics.recordManagedEvent({ type: "started", component: "gateway", generation: 2, pid: 41002, ownership: "owned", operation: "process_restart", operationId }), false, "shutdown rejects new restart state");
  assert.equal(diagnostics.recordManagedEvent({ type: "stopping", component: "gateway", generation: 1, pid: 41001, ownership: "owned", operation: "shutdown" }), true, "shutdown keeps finalization events");
  const snapshot = diagnostics.snapshot();
  const gatewaySnapshot = snapshot.components.find((component) => component.component === "gateway");
  assert.equal(gatewaySnapshot.restartCount, 0);
  assert.equal(snapshot.recoveryCount, 1);
  assert.equal(gatewaySnapshot.status, "stopping");
  assert.equal(gatewaySnapshot.lastFailure?.exitSignal, null, "intentional shutdown must not create a new failure");
  const noSecretSnapshot = JSON.stringify(snapshot);
  for (const forbidden of ["/private/runtime", "raw-error-sentinel", "Authorization", "cookie", "token"]) assert.equal(noSecretSnapshot.includes(forbidden), false);

  const lifecyclePath = path.join(temporaryDirectory, "runtime-supervisor.ndjson");
  const writer = createBoundedNdjsonWriter({ filePath: lifecyclePath, maxBytes: 80, maxRotatedFiles: 3 });
  await writer.append({ event: "one", value: "x".repeat(40) });
  await writer.append({ event: "two", value: "x".repeat(40) });
  await writer.append({ event: "three", value: "x".repeat(40) });
  await writer.flush();
  const files = await readdir(temporaryDirectory);
  assert(files.includes("runtime-supervisor.ndjson"));
  assert(files.some((file) => file === "runtime-supervisor.ndjson.1"));
  assert.equal(files.some((file) => file === "runtime-supervisor.ndjson.4"), false, "retention is limited to three rotations");
  assert((await readFile(lifecyclePath, "utf8")).endsWith("\n"));

  let appendAttempts = 0;
  const retentionEvents = [];
  const failingWriter = createBoundedNdjsonWriter({
    filePath: path.join(temporaryDirectory, "failing.ndjson"),
    fileSystem: {
      stat: async () => ({ size: 0 }), rm: async () => {}, rename: async () => {},
      appendFile: async () => { appendAttempts += 1; if (appendAttempts === 1) throw new Error("raw-error-sentinel"); }
    },
    onDegraded: () => retentionEvents.push("degraded"),
    onRecovered: () => retentionEvents.push("recovered")
  });
  assert.equal((await failingWriter.append({ status: "safe" })).written, false);
  assert.equal((await failingWriter.append({ status: "safe" })).written, true);
  assert.deepEqual(retentionEvents, ["degraded", "recovered"], "future lifecycle events may safely recover retention");

  const events = [];
  const child = new EventEmitter();
  child.pid = 41003;
  child.exitCode = null;
  const controller = new ManagedProcessController({
    supervisorInstanceId: "test",
    metadataPath: path.join(temporaryDirectory, "managed.json"),
    spawnImpl: () => child,
    onProcessEvent: (event) => events.push(event)
  });
  await controller.start("gateway", { command: "node", args: [], cwd: temporaryDirectory, env: {} }, { operation: "initial_start", operationId });
  child.exitCode = 1;
  child.emit("exit", 1, null);
  await new Promise((resolve) => setImmediate(resolve));
  await controller.flushMetadata();
  assert.deepEqual(events.map((event) => event.type), ["started", "exit"]);
  assert.equal(events[0].pid, 41003);
  assert.equal("error" in events[1], false, "raw child errors must not be emitted");

  const failedSpawnEvents = [];
  const failedSpawn = new ManagedProcessController({
    supervisorInstanceId: "test", metadataPath: path.join(temporaryDirectory, "failed-spawn.json"),
    spawnImpl: () => { throw new Error("raw-error-sentinel"); }, onProcessEvent: (event) => failedSpawnEvents.push(event)
  });
  await assert.rejects(() => failedSpawn.start("proxy", { command: "node", args: [], cwd: temporaryDirectory, env: {} }, { operation: "initial_start", operationId }));
  assert.deepEqual(failedSpawnEvents.map((event) => event.type), ["start_failed"]);
  assert.equal(JSON.stringify(failedSpawnEvents).includes("raw-error-sentinel"), false);

  let releaseMetadata;
  let firstMetadataWrite = true;
  const raceChild = new EventEmitter();
  raceChild.pid = 41004;
  raceChild.exitCode = null;
  const raceEvents = [];
  const raceController = new ManagedProcessController({
    supervisorInstanceId: "test", metadataPath: path.join(temporaryDirectory, "race.json"), spawnImpl: () => raceChild,
    fileSystem: { writeFile: async () => firstMetadataWrite ? new Promise((resolve) => { firstMetadataWrite = false; releaseMetadata = resolve; }) : undefined, rename: async () => {} },
    onProcessEvent: (event) => raceEvents.push(event)
  });
  const racingStart = raceController.start("dsh", { command: "node", args: [], cwd: temporaryDirectory, env: {} }, { operation: "initial_start", operationId });
  await new Promise((resolve) => setImmediate(resolve));
  raceChild.exitCode = 0;
  raceChild.emit("exit", 0, "SIGTERM");
  releaseMetadata();
  await racingStart;
  await raceController.flushMetadata();
  assert.deepEqual(raceEvents.map((event) => event.type), ["exit"], "exit during metadata persistence must not produce late started");

  const recoveryEvents = [];
  const recoveryCore = new RuntimeLifecycleCore({
    controller: { get: () => ({ generation: 1 }) }, inspectStatic: async () => ({ ok: true }),
    inspectRuntime: async () => ({ dsh: true, gateway: true, proxy: true, mcp: true, credentialStatus: "configured", agentConfigurationStatus: "valid" }),
    prepareRuntime: async () => {}, startComponent: async () => { throw new Error("start failure"); }, stopComponents: async () => {},
    onRecoveryEvent: (event) => recoveryEvents.push(event)
  });
  await recoveryCore.ensureReady({ recovering: true, trigger: "runtime_recovery" });
  assert.deepEqual(recoveryEvents.map((event) => `${event.type}:${event.outcome ?? ""}`), ["started:", "completed:failed"], "failed recovery is instrumented exactly once");

  console.log("Runtime diagnostics instrumentation verification passed.");
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
