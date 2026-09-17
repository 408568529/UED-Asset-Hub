import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runtimeControlEndpoint, runtimeControlTransport } from "./runtime-control-transport.mjs";

async function main() {
  assert.equal(runtimeControlEndpoint({ scope: "graceful", instanceId: "candidate-01", platform: "win32" }), "\\\\.\\pipe\\ued-asset-hub-graceful-candidate-01");
  assert.throws(() => runtimeControlEndpoint({ scope: "../bad", instanceId: "candidate-01", platform: "win32" }), /invalid/);
  const directory = await mkdtemp(process.platform === "win32" ? path.join(os.tmpdir(), "ued-runtime-control-") : "/tmp/ued-runtime-control-");
  const transport = runtimeControlTransport();
  const endpoint = process.platform === "win32"
    ? runtimeControlEndpoint({ scope: "verify", instanceId: `${process.pid}-${Date.now()}`, platform: "win32" })
    : runtimeControlEndpoint({ scope: "verify", instanceId: `${process.pid}-${Date.now()}`, directory });
  const server = createServer((socket) => socket.end("ok"));
  try {
    await transport.listen(server, endpoint);
    const result = await new Promise((resolve, reject) => {
      let output = "";
      const socket = transport.connect(endpoint);
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => { output += chunk; });
      socket.once("error", reject);
      socket.once("end", () => resolve(output));
    });
    assert.equal(result, "ok", "Runtime Control transport connects only to its isolated endpoint");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
  console.log("[UED Agent] Windows Runtime Control transport contract passed.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
