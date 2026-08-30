import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { WindowsProcessAdapter } from "./managed-process-platform-adapter.mjs";

if (process.platform !== "win32") {
  console.log("[UED Agent] Windows native managed-process verification: SKIPPED (requires Windows Server 2025 native execution).");
  process.exit(0);
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

async function waitForMessage(child) {
  const [message] = await Promise.race([once(child, "message"), new Promise((_, reject) => setTimeout(() => reject(new Error("Fixture did not become ready.")), 10_000))]);
  return message;
}

async function portReleased(port) {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(port, "127.0.0.1", resolve));
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function runFixture({ ignoreShutdown }) {
  const port = await freePort();
  const token = "native-fixture-token";
  const child = spawn(process.execPath, ["scripts/fixtures/managed-process-fixture.mjs", "--port", String(port), "--shutdown-token", token, "--ignore-shutdown", String(ignoreShutdown), "--with-descendant", "true"], { cwd: process.cwd(), stdio: ["ignore", "ignore", "ignore", "ipc"] });
  const ready = await waitForMessage(child);
  const adapter = new WindowsProcessAdapter();
  const specification = {
    command: process.execPath,
    args: [],
    cwd: process.cwd(),
    gracefulShutdown: async () => { child.send({ type: "managed-graceful-shutdown", token }); return { acknowledged: true }; },
    convergence: { verify: () => portReleased(port) }
  };
  const identity = await adapter.captureIdentity({ child, specification, supervisorInstanceId: "native-supervisor", runtimeInstanceId: "native-runtime", generation: 1 });
  const record = { component: "fixture", ...identity, child, managedState: "running" };
  return { adapter, child, ready, record, specification };
}

const graceful = await runFixture({ ignoreShutdown: false });
assert.equal((await graceful.adapter.inspect(graceful.record)).ownership, "strong");
assert.equal((await graceful.adapter.requestGracefulShutdown(graceful.record, graceful.specification)).acknowledged, true);
assert.equal(await graceful.adapter.waitForExit(graceful.record, 10_000), true);
await graceful.adapter.verifyConvergence(graceful.record, graceful.specification);

const forced = await runFixture({ ignoreShutdown: true });
assert.equal((await forced.adapter.requestGracefulShutdown(forced.record, forced.specification)).acknowledged, true);
assert.equal(await forced.adapter.waitForExit(forced.record, 50), false);
await forced.adapter.forceTerminate(forced.record);
assert.equal(await forced.adapter.waitForExit(forced.record, 10_000), true);
await forced.adapter.verifyConvergence(forced.record, forced.specification);
assert.equal(Number.isInteger(forced.ready.descendantPid), true);
console.log("[UED Agent] Windows native managed-process verification passed.");
