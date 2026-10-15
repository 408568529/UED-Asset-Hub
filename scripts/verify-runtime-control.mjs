import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acceptsSameOriginJsonMutation, invokeRuntimeControl, invokeRuntimeShutdown } from "../src/lib/runtimeControl.ts";
import { createRuntimeControlBridge, requestRuntimeControl, runtimeControlEndpoint } from "./runtime-control-bridge.mjs";

const workbenchSource = await readFile(new URL("../src/components/agent/AgentOfficialWorkbench.tsx", import.meta.url), "utf8");
assert.match(workbenchSource, /frameLoadTimerRef\.current = window\.setTimeout\([\s\S]*?}, 45_000\);/, "iframe load remains bounded while allowing the measured Windows startup latency");

const ready = { status: "ready", phase: null, reasonCode: null, operationId: null, startedAt: null, generation: 7, credentialStatus: "configured", retryable: false, shell: "ready", operation: null };

function mutation(headers = {}) {
  return new Request("http://asset-hub.test/api/runtime/start", { method: "POST", headers: { Host: "asset-hub.test", Origin: "http://asset-hub.test", "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", ...headers }, body: "{}" });
}

async function createFixture({ inspect = async () => ready, ensureReady = async () => ready, shutdown, shutdownBinding } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-runtime-control-"));
  const supervisorDirectory = path.join(root, "supervisor");
  await mkdir(supervisorDirectory);
  const endpoint = runtimeControlEndpoint({ supervisorDirectory, instanceId: "test" });
  const events = [];
  const bridge = createRuntimeControlBridge({ endpoint, token: "control-token", inspect, ensureReady, shutdown, shutdownBinding, onEvent: (event) => events.push(event) });
  await bridge.start();
  return { root, endpoint, events, bridge };
}

async function testStatusReadOnly() {
  let inspections = 0;
  let starts = 0;
  const fixture = await createFixture({ inspect: async () => { inspections += 1; return { ...ready, credential: "never-return-this" }; }, ensureReady: async () => { starts += 1; return ready; } });
  await mkdir(path.join(fixture.root, "data"));
  await mkdir(path.join(fixture.root, "vendor-dsh"));
  const before = await readdir(fixture.root);
  const state = await requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "status" });
  assert.equal(inspections, 1);
  assert.equal(starts, 0, "status never starts Runtime");
  assert.deepEqual(await readdir(fixture.root), before, "status creates no Runtime directory or file and leaves DATA/DSH untouched");
  assert.equal("credential" in state, false, "credential contents are excluded from response");
  assert.equal(JSON.stringify(fixture.events).includes("never-return-this"), false, "credential contents are excluded from log events");
  await fixture.bridge.stop();
  await rm(fixture.root, { recursive: true, force: true });
}

async function testApplicationStatusAllowsSlowWindowsHealthCheck() {
  const previousEndpoint = process.env.RUNTIME_CONTROL_ENDPOINT;
  const previousToken = process.env.RUNTIME_CONTROL_TOKEN;
  let shutdownCalls = 0;
  const binding = { supervisorInstanceId: "supervisor", runtimeInstanceId: "runtime", generation: 7 };
  const fixture = await createFixture({ inspect: async () => { await new Promise((resolve) => setTimeout(resolve, 16_000)); return ready; }, shutdownBinding: () => binding, shutdown: async () => { shutdownCalls += 1; } });
  process.env.RUNTIME_CONTROL_ENDPOINT = fixture.endpoint;
  process.env.RUNTIME_CONTROL_TOKEN = "control-token";
  try {
    const state = await invokeRuntimeControl("status");
    assert.equal(state.status, "ready", "read-only Windows health inspection can exceed the former fifteen-second deadline");
    await invokeRuntimeShutdown();
    assert.equal(shutdownCalls, 1, "graceful shutdown obtains its binding after a slow read-only status inspection");
  } finally {
    if (previousEndpoint === undefined) delete process.env.RUNTIME_CONTROL_ENDPOINT;
    else process.env.RUNTIME_CONTROL_ENDPOINT = previousEndpoint;
    if (previousToken === undefined) delete process.env.RUNTIME_CONTROL_TOKEN;
    else process.env.RUNTIME_CONTROL_TOKEN = previousToken;
    await fixture.bridge.stop();
    await rm(fixture.root, { recursive: true, force: true });
  }
}

async function testStartConcurrencyAndFailures() {
  let starts = 0;
  let current = { ...ready, status: "unavailable", credentialStatus: "unknown" };
  let operation = null;
  const ensureReady = async () => {
    if (current.status === "ready") return current;
    if (!operation) {
      starts += 1;
      operation = new Promise((resolve) => setTimeout(() => { current = { ...ready }; resolve(ready); }, 25)).finally(() => { operation = null; });
    }
    return operation;
  };
  const fixture = await createFixture({ inspect: async () => current, ensureReady });
  const values = await Promise.all(Array.from({ length: 3 }, () => requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "start" })));
  assert.equal(values.every((value) => value.status === "ready"), true);
  assert.equal(starts, 1, "concurrent requests share the Core operation");
  await requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "start" });
  assert.equal(starts, 1, "ready start is idempotent");
  await assert.rejects(() => requestRuntimeControl({ endpoint: fixture.endpoint, token: "wrong", operation: "status" }), /rejected/);
  await fixture.bridge.stop();
  await rm(fixture.root, { recursive: true, force: true });
}

async function testAbortDoesNotCancelLifecycle() {
  let completed = false;
  const fixture = await createFixture({ ensureReady: async () => { await new Promise((resolve) => setTimeout(resolve, 30)); completed = true; return ready; } });
  const controller = new AbortController();
  const pending = requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "start", signal: controller.signal });
  setTimeout(() => controller.abort(), 5);
  await assert.rejects(pending, /aborted/);
  await new Promise((resolve) => setTimeout(resolve, 45));
  assert.equal(completed, true, "aborted HTTP-equivalent client does not cancel Runtime lifecycle");
  await fixture.bridge.stop();
  await rm(fixture.root, { recursive: true, force: true });
}

async function testBridgeShutdownBarrier() {
  let releaseInspect;
  let markInspectStarted;
  const inspectStarted = new Promise((resolve) => { markInspectStarted = resolve; });
  const fixture = await createFixture({ inspect: async () => {
    markInspectStarted();
    return new Promise((resolve) => { releaseInspect = resolve; });
  } });
  const pending = requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "status" });
  const pendingRejected = assert.rejects(pending, /unavailable|failed/, "bridge shutdown closes an in-flight control connection");
  await inspectStarted;
  const firstStop = fixture.bridge.stop();
  const secondStop = fixture.bridge.stop();
  assert.strictEqual(firstStop, secondStop, "repeated bridge stop shares one shutdown Promise");
  await Promise.all([firstStop, secondStop]);
  await pendingRejected;
  await assert.rejects(() => requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "status" }), /unavailable/);
  releaseInspect(ready);
  await rm(fixture.root, { recursive: true, force: true });
}

async function testShutdownBindingAndIdempotency() {
  let calls = 0;
  const binding = { supervisorInstanceId: "supervisor", runtimeInstanceId: "runtime", generation: 8 };
  const fixture = await createFixture({ shutdownBinding: () => binding, shutdown: async () => { calls += 1; } });
  await assert.rejects(() => requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "shutdown", binding: { ...binding, generation: 7 } }), /rejected/);
  assert.equal(calls, 0, "stale generation capability is denied before lifecycle entry");
  const result = await requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "shutdown", binding });
  assert.equal(result.status, "terminal");
  assert.equal(calls, 1, "shutdown enters the shared closure once");
  await assert.rejects(() => requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "shutdown", binding }), /rejected/);
  assert.equal(calls, 1, "duplicate shutdown never creates a second lifecycle");
  await fixture.bridge.stop();
  await rm(fixture.root, { recursive: true, force: true });
}

function testRequestSecurity() {
  assert.equal(acceptsSameOriginJsonMutation(mutation()), true);
  assert.equal(acceptsSameOriginJsonMutation(mutation({ Origin: "https://attacker.invalid" })), false, "cross-origin mutation is rejected");
  assert.equal(acceptsSameOriginJsonMutation(mutation({ Host: "other-host.test" })), false, "invalid Host is rejected");
  assert.equal(acceptsSameOriginJsonMutation(mutation({ "Content-Type": "text/plain" })), false, "invalid content type is rejected");
  assert.equal(acceptsSameOriginJsonMutation(mutation({ "Sec-Fetch-Site": "cross-site" })), false, "cross-site fetch is rejected");
}

async function testReasonAndShellContract() {
  const fixture = await createFixture({ inspect: async () => ({ ...ready, status: "configuration_required", reasonCode: "build_missing", credentialStatus: "unknown", shell: "ready", stack: "private", env: "private" }) });
  const state = await requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "status" });
  assert.equal(state.status, "configuration_required");
  assert.equal(state.reasonCode, "build_missing");
  assert.equal(state.retryable, false, "configuration is never retryable");
  assert.equal(state.shell, "ready", "Agent Runtime failure never changes Shell status");
  assert.equal(JSON.stringify(state).includes("private"), false, "stack/env never enter response");
  await fixture.bridge.stop();
  await rm(fixture.root, { recursive: true, force: true });
}

async function testReasonMappingIsPreserved() {
  for (const [status, reasonCode] of [["configuration_required", "source_invalid"], ["configuration_required", "build_missing"], ["error", "port_conflict"], ["error", "orphan_processes_detected"], ["error", "runtime_health_failed"]]) {
    const fixture = await createFixture({ inspect: async () => ({ ...ready, status, reasonCode, credentialStatus: "unknown", shell: "ready", generation: 9 }) });
    const state = await requestRuntimeControl({ endpoint: fixture.endpoint, token: "control-token", operation: "status" });
    assert.equal(state.status, status, `${reasonCode} status is preserved`);
    assert.equal(state.reasonCode, reasonCode, `${reasonCode} is not replaced by an API-specific error`);
    assert.equal(state.generation, 9, "stale generation data cannot overwrite the current snapshot");
    await fixture.bridge.stop();
    await rm(fixture.root, { recursive: true, force: true });
  }
}

async function testRetryabilityContract() {
  const retryable = await createFixture({ inspect: async () => ({ ...ready, status: "error", reasonCode: "runtime_degraded", retryable: true }) });
  const retryableState = await requestRuntimeControl({ endpoint: retryable.endpoint, token: "control-token", operation: "status" });
  assert.equal(retryableState.retryable, true, "explicit retryable recovery state is preserved");
  await retryable.bridge.stop();
  await rm(retryable.root, { recursive: true, force: true });

  const failClosed = await createFixture({ inspect: async () => ({ ...ready, status: "error", reasonCode: "port_conflict", retryable: true }) });
  const failClosedState = await requestRuntimeControl({ endpoint: failClosed.endpoint, token: "control-token", operation: "status" });
  assert.equal(failClosedState.retryable, false, "port conflict remains non-retryable");
  await failClosed.bridge.stop();
  await rm(failClosed.root, { recursive: true, force: true });

  const orphan = await createFixture({ inspect: async () => ({ ...ready, status: "error", reasonCode: "orphan_processes_detected", retryable: true }) });
  const orphanState = await requestRuntimeControl({ endpoint: orphan.endpoint, token: "control-token", operation: "status" });
  assert.equal(orphanState.retryable, false, "orphan ownership error remains non-retryable");
  await orphan.bridge.stop();
  await rm(orphan.root, { recursive: true, force: true });

  const starting = await createFixture({ inspect: async () => ({ ...ready, status: "starting", phase: "health-check", retryable: true }) });
  const startingState = await requestRuntimeControl({ endpoint: starting.endpoint, token: "control-token", operation: "status" });
  assert.equal(startingState.retryable, false, "starting is never retryable");
  await starting.bridge.stop();
  await rm(starting.root, { recursive: true, force: true });
}

async function main() {
  await testStatusReadOnly();
  await testApplicationStatusAllowsSlowWindowsHealthCheck();
  await testStartConcurrencyAndFailures();
  await testAbortDoesNotCancelLifecycle();
  await testBridgeShutdownBarrier();
  await testShutdownBindingAndIdempotency();
  testRequestSecurity();
  await testReasonAndShellContract();
  await testReasonMappingIsPreserved();
  await testRetryabilityContract();
  console.log("[UED Agent] Runtime control foundation checks passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
