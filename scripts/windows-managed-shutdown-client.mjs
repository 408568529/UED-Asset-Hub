import { randomBytes } from "node:crypto";
import { discoverShutdownCapability, stopDiscoveryEndpoint } from "./windows-stop-discovery.mjs";
import { requestRuntimeControl } from "./runtime-control-bridge.mjs";

const timeoutMs = Number.parseInt(process.argv[2] || "90000", 10);

async function main() {
  if (process.platform !== "win32" || process.env.UED_WINDOWS_SERVICE_MODE !== "true") throw new Error("Managed shutdown client is only available in Windows service mode.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 90_000) throw new Error("Managed shutdown timeout is invalid.");
  const startedAt = Date.now();
  const capability = await discoverShutdownCapability({ endpoint: stopDiscoveryEndpoint(), clientNonce: randomBytes(24).toString("base64url"), timeoutMs: Math.min(timeoutMs, 10_000) });
  if (capability.protocolVersion !== 1) throw new Error("Managed shutdown capability version is invalid.");
  const remainingMs = timeoutMs - (Date.now() - startedAt);
  if (remainingMs < 1_000) throw new Error("Managed shutdown timed out before Runtime Control request.");
  await requestRuntimeControl({ endpoint: capability.endpoint, token: capability.token, operation: "shutdown", binding: { supervisorInstanceId: capability.supervisorInstanceId, runtimeInstanceId: capability.runtimeInstanceId, generation: capability.generation }, timeoutMs: remainingMs });
}

main().catch((error) => { console.error(`[Managed Shutdown Client] ${error instanceof Error ? error.message : "failed"}`); process.exitCode = 1; });
