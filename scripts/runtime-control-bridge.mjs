import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, createConnection } from "node:net";
import { chmod, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const maximumRequestBytes = 16 * 1024;
const allowedOperations = new Set(["status", "start"]);

function safeTokenEquals(received, expected) {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const actual = Buffer.from(received);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export function runtimeControlEndpoint({ supervisorDirectory, instanceId, platform = process.platform }) {
  if (platform === "win32") return `\\\\.\\pipe\\ued-asset-hub-runtime-control-${instanceId}`;
  const digest = createHash("sha256").update(`${supervisorDirectory}:${instanceId}`).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), `ued-runtime-control-${digest}.sock`);
}

export function publicRuntimeState(state) {
  return {
    status: state?.status ?? "unavailable",
    phase: state?.phase ?? null,
    reasonCode: state?.reasonCode ?? null,
    operationId: state?.operationId ?? null,
    startedAt: state?.startedAt ?? null,
    generation: Number.isInteger(state?.generation) ? state.generation : 0,
    credentialStatus: ["configured", "missing", "unknown"].includes(state?.credentialStatus) ? state.credentialStatus : "unknown",
    shell: state?.shell === "ready" ? "ready" : "unavailable",
    operation: state?.operation && typeof state.operation === "object"
      ? { operationId: state.operation.operationId ?? null, startedAt: state.operation.startedAt ?? null, phase: state.operation.phase ?? null, generation: Number.isInteger(state.operation.generation) ? state.operation.generation : 0 }
      : null
  };
}

function write(socket, body) {
  socket.end(`${JSON.stringify(body)}\n`);
}

export function createRuntimeControlBridge({ endpoint, token, inspect, ensureReady, onEvent = () => {} }) {
  const sockets = new Set();
  let started = false;
  let startPromise = null;
  let stopPromise = null;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    let input = "";
    let handled = false;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      input += chunk;
      if (Buffer.byteLength(input) > maximumRequestBytes) socket.destroy();
      if (!handled && input.includes("\n")) {
        handled = true;
        void handle(input.trim());
      }
    });
    socket.once("error", () => {});
    const handle = async (payload) => {
      let request;
      try { request = JSON.parse(payload); } catch { write(socket, { ok: false, reasonCode: "control_request_invalid" }); return; }
      if (!safeTokenEquals(request?.token, token) || !allowedOperations.has(request?.operation)) {
        write(socket, { ok: false, reasonCode: "control_forbidden" });
        return;
      }
      try {
        const state = request.operation === "status" ? await inspect() : await ensureReady();
        const result = publicRuntimeState(state);
        try { onEvent({ operation: request.operation, status: result.status, reasonCode: result.reasonCode, generation: result.generation }); } catch {}
        write(socket, { ok: true, runtime: result });
      } catch {
        try { onEvent({ operation: request.operation, status: "error", reasonCode: "runtime_control_failed", generation: null }); } catch {}
        write(socket, { ok: false, reasonCode: "runtime_control_failed" });
      }
    };
    socket.once("end", () => { if (!handled) write(socket, { ok: false, reasonCode: "control_request_invalid" }); });
  });
  return {
    endpoint,
    start: () => {
      if (!startPromise) {
        startPromise = new Promise((resolve, reject) => {
          const failStart = (error) => { server.off("listening", listen); reject(error); };
          const listen = () => {
            server.off("error", failStart);
            Promise.resolve(process.platform === "win32" ? undefined : chmod(endpoint, 0o600)).then(() => {
              started = true;
              resolve();
            }, reject);
          };
          server.once("error", failStart);
          server.once("listening", listen);
          server.listen(endpoint);
        });
      }
      return startPromise;
    },
    stop: () => {
      if (!stopPromise) {
        stopPromise = (async () => {
          for (const socket of sockets) socket.destroy();
          if (started) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
          if (process.platform !== "win32") await unlink(endpoint).catch((error) => { if (error?.code !== "ENOENT") throw error; });
          started = false;
        })();
      }
      return stopPromise;
    }
  };
}

export async function requestRuntimeControl({ endpoint, token, operation, timeoutMs = 5_000, signal }) {
  if (!allowedOperations.has(operation)) throw new Error("Unsupported runtime control operation.");
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timeout); signal?.removeEventListener("abort", abort); callback(value); };
    const abort = () => { socket.destroy(); finish(reject, new Error("Runtime control request aborted.")); };
    const socket = createConnection(endpoint);
    const timeout = setTimeout(() => { socket.destroy(); finish(reject, new Error("Runtime control request timed out.")); }, timeoutMs);
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${JSON.stringify({ token, operation })}\n`));
    socket.on("data", (chunk) => { output += chunk; });
    socket.once("error", () => finish(reject, new Error("Runtime control is unavailable.")));
    socket.once("end", () => {
      let response;
      try {
        response = JSON.parse(output);
      } catch { finish(reject, new Error("Runtime control failed.")); return; }
      if (!response?.ok) {
        finish(reject, new Error(response?.reasonCode === "control_forbidden" ? "Runtime control rejected the request." : "Runtime control failed."));
        return;
      }
      finish(resolve, publicRuntimeState(response.runtime));
    });
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }
  });
}
