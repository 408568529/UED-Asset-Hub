import { randomBytes } from "node:crypto";
import { discoverShutdownCapability, stopDiscoveryEndpoint } from "./windows-stop-discovery.mjs";
import { requestRuntimeControl } from "./runtime-control-bridge.mjs";
import { resolveWindowsServiceIdentity } from "./windows-service-identity.mjs";

const timeoutMs = Number.parseInt(process.argv[2] || "90000", 10);
let phase = "startup-guard";

async function main() {
  if (process.platform !== "win32" || process.env.UED_WINDOWS_SERVICE_MODE !== "true") throw new Error("Managed shutdown client is only available in Windows service mode.");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 90_000) throw new Error("Managed shutdown timeout is invalid.");
  const startedAt = Date.now();
  phase = "service-identity-resolution";
  const identity = resolveWindowsServiceIdentity();
  console.log("[Managed Shutdown Client] phase=service-identity-resolution status=passed");
  phase = "stop-discovery-connect";
  const capability = await discoverShutdownCapability({ endpoint: stopDiscoveryEndpoint(identity.serviceName), clientNonce: randomBytes(24).toString("base64url"), timeoutMs: Math.min(timeoutMs, 10_000) });
  console.log("[Managed Shutdown Client] phase=stop-discovery-connect status=passed");
  phase = "capability-version-validation";
  if (capability.protocolVersion !== 1) throw new Error("Managed shutdown capability version is invalid.");
  const remainingMs = timeoutMs - (Date.now() - startedAt);
  if (remainingMs < 1_000) throw new Error("Managed shutdown timed out before Runtime Control request.");
  phase = "runtime-control-request";
  console.log("[Managed Shutdown Client] phase=runtime-control-request status=started");
  await requestRuntimeControl({ endpoint: capability.endpoint, token: capability.token, operation: "shutdown", binding: { supervisorInstanceId: capability.supervisorInstanceId, runtimeInstanceId: capability.runtimeInstanceId, generation: capability.generation }, timeoutMs: remainingMs });
  console.log("[Managed Shutdown Client] phase=runtime-control-request status=passed");
}

main().catch(() => { console.error(`[Managed Shutdown Client] phase=${phase} status=failed`); process.exitCode = 1; });
process.on("exit", (code) => { console.error(`[Managed Shutdown Client] phase=${phase} status=exited exitCode=${code}`); });
