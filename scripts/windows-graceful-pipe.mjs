import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:net";
import { runtimeControlTransport } from "./runtime-control-transport.mjs";

const maxBytes = 2 * 1024;
export const gracefulProtocolVersion = 1;
const transport = runtimeControlTransport();

function secureEquals(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") return false;
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createGracefulCapability({ runtimeInstanceId, component, generation, onShutdown, endpoint = `\\\\.\\pipe\\ued-asset-hub-graceful-${randomBytes(18).toString("hex")}`, token = randomBytes(32).toString("base64url") }) {
  let used = false;
  const server = createServer((socket) => {
    let input = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      input += chunk;
      if (Buffer.byteLength(input) > maxBytes) socket.destroy();
      if (!input.includes("\n")) return;
      let request;
      try { request = JSON.parse(input.trim()); } catch { socket.end(JSON.stringify({ accepted: false, reasonCode: "graceful_request_invalid" }) + "\n"); return; }
      const accepted = !used && request?.protocolVersion === gracefulProtocolVersion && request?.operation === "graceful-shutdown" && request?.runtimeInstanceId === runtimeInstanceId && request?.component === component && request?.generation === generation && secureEquals(request?.token, token);
      if (!accepted) { socket.end(JSON.stringify({ accepted: false, reasonCode: used ? "graceful_capability_used" : "graceful_forbidden" }) + "\n"); return; }
      used = true;
      socket.end(JSON.stringify({ accepted: true, reasonCode: null }) + "\n", () => { void new Promise((resolve) => server.close(resolve)).then(onShutdown); });
    });
  });
  return { endpoint, token, start: () => transport.listen(server, endpoint), stop: () => new Promise((resolve) => server.close(() => resolve())) };
}

export function requestGracefulCapability({ endpoint, token, runtimeInstanceId, component, generation, timeoutMs = 2_000 }) {
  return new Promise((resolve) => {
    let output = "";
    const socket = transport.connect(endpoint);
    const timeout = setTimeout(() => { socket.destroy(); resolve({ acknowledged: false, reasonCode: "graceful_pipe_timeout" }); }, timeoutMs);
    const finish = (result) => { clearTimeout(timeout); resolve(result); };
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.end(JSON.stringify({ protocolVersion: gracefulProtocolVersion, token, runtimeInstanceId, component, generation, operation: "graceful-shutdown" }) + "\n"));
    socket.on("data", (chunk) => { output += chunk; });
    socket.once("error", () => finish({ acknowledged: false, reasonCode: "graceful_pipe_unavailable" }));
    socket.once("end", () => { try { const result = JSON.parse(output); finish({ acknowledged: result?.accepted === true, reasonCode: result?.reasonCode ?? null }); } catch { finish({ acknowledged: false, reasonCode: "graceful_pipe_invalid" }); } });
  });
}
