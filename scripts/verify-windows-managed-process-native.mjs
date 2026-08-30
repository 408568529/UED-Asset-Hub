import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { ManagedProcessController } from "./managed-process-controller.mjs";
import { WindowsProcessAdapter } from "./managed-process-platform-adapter.mjs";

if (process.platform !== "win32") {
  console.log("[UED Agent] Windows native managed-process verification: SKIPPED (requires Windows Server 2025 x64, Node 22.23.2, and MSVC-built helper).");
  process.exit(0);
}

const root = path.resolve(import.meta.dirname, "..");
const helperPath = path.join(root, "native", "windows-job-helper", "bin", "ued-windows-job-helper.exe");
const manifestPath = path.join(root, "native", "windows-job-helper", "bin", "ued-windows-job-helper.manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
assert.equal(manifest.architecture, "x64");
assert.equal(manifest.sha256, createHash("sha256").update(await readFile(helperPath)).digest("hex"), "helper integrity manifest must match binary");

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!address || typeof address === "string") throw new Error("Unable to allocate a fixture port.");
  return address.port;
}

async function portReleased(port) {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(port, "127.0.0.1", resolve));
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
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
    windowsJobHelper: { path: helperPath, manifestPath, sha256: manifest.sha256 },
    convergence: { verify: () => portReleased(port) }
  };
  const record = await controller.start("dsh", specification);
  return { controller, record, port, sandbox };
}

const graceful = await runFixture({ ignoreShutdown: false });
assert.equal(graceful.record.jobOwnership.rootAssigned, true, "root was assigned before resume");
await graceful.controller.stop("dsh", { timeoutMs: 10_000 });
await portReleased(graceful.port);
await rm(graceful.sandbox, { recursive: true, force: true });

const forced = await runFixture({ ignoreShutdown: true });
await forced.controller.stop("dsh", { timeoutMs: 100 });
await portReleased(forced.port);
await rm(forced.sandbox, { recursive: true, force: true });
console.log("[UED Agent] Windows native managed-process verification passed.");
