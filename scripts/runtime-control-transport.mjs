import { createConnection } from "node:net";
import { createHash } from "node:crypto";
import path from "node:path";

const validScope = /^[a-z0-9-]{1,80}$/;

export function runtimeControlEndpoint({ scope, instanceId, platform = process.platform, directory } = {}) {
  if (!validScope.test(scope || "") || !validScope.test(instanceId || "")) throw new Error("Runtime Control endpoint identity is invalid.");
  if (platform === "win32") return `\\\\.\\pipe\\ued-asset-hub-${scope}-${instanceId}`;
  if (!directory || !path.isAbsolute(directory)) throw new Error("Unix Runtime Control endpoint directory is invalid.");
  const token = createHash("sha256").update(`${scope}:${instanceId}`).digest("hex").slice(0, 20);
  return path.join(directory, `ued-${token}.sock`);
}

export function runtimeControlTransport({ platform = process.platform } = {}) {
  return {
    platform,
    listen(server, endpoint) {
      return new Promise((resolve, reject) => server.once("error", reject).listen(endpoint, resolve));
    },
    connect(endpoint) {
      return createConnection(endpoint);
    }
  };
}
