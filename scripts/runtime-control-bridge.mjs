import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, createConnection } from "node:net";
import { chmod, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseRuntimeDiagnosticsSnapshot } from "./runtime-diagnostics-contract.mjs";

const maximumRequestBytes = 16 * 1024;
const allowedOperations = new Set(["status", "start", "diagnostics", "shutdown"]);
const nonRetryableReasonCodes = new Set(["port_conflict", "orphan_processes_detected", "runtime_ownership_conflict", "runtime_lock_conflict", "runtime_configuration_invalid", "agent_configuration_invalid", "source_invalid", "build_missing", "build_invalid", "credential_missing", "credential_status_unknown", "runtime_control_unavailable"]);

function safeTokenEquals(received, expected) {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  const actual = Buffer.from(received);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function sameShutdownBinding(received, expected) {
  return Boolean(received && expected && received.supervisorInstanceId === expected.supervisorInstanceId && received.runtimeInstanceId === expected.runtimeInstanceId && Number.isInteger(received.generation) && received.generation === expected.generation);
}

export function runtimeControlEndpoint({ supervisorDirectory, instanceId, platform = process.platform }) {
  if (platform === "win32") return `\\\\.\\pipe\\ued-asset-hub-runtime-control-${instanceId}`;
  const digest = createHash("sha256").update(`${supervisorDirectory}:${instanceId}`).digest("hex").slice(0, 24);
  return path.join(os.tmpdir(), `ued-runtime-control-${digest}.sock`);
}

export function publicRuntimeState(state) {
  const status = ["unavailable", "starting", "shutting_down", "ready", "configuration_required", "error"].includes(state?.status) ? state.status : "unavailable";
  const reasonCode = state?.reasonCode ?? null;
  return {
    status,
    phase: state?.phase ?? null,
    reasonCode,
    operationId: state?.operationId ?? null,
    startedAt: state?.startedAt ?? null,
    generation: Number.isInteger(state?.generation) ? state.generation : 0,
    credentialStatus: ["configured", "missing", "unknown"].includes(state?.credentialStatus) ? state.credentialStatus : "unknown",
    retryable: (status === "error" || status === "unavailable") && state?.retryable === true && !nonRetryableReasonCodes.has(reasonCode),
    shell: state?.shell === "ready" ? "ready" : "unavailable",
    operation: state?.operation && typeof state.operation === "object"
      ? { operationId: state.operation.operationId ?? null, startedAt: state.operation.startedAt ?? null, phase: state.operation.phase ?? null, generation: Number.isInteger(state.operation.generation) ? state.operation.generation : 0 }
      : null
  };
}

function write(socket, body, callback) {
  socket.end(`${JSON.stringify(body)}\n`, callback);
}

export function createRuntimeControlBridge({ endpoint, token, inspect, ensureReady, shutdown, shutdownBinding = () => null, diagnostics = async () => null, onEvent = () => {}, onShutdownDelivered = () => {} }) {
  const sockets = new Set();
  let started = false;
  let startPromise = null;
  let stopPromise = null;
  let shutdownRequested = false;
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
        if (request.operation === "shutdown") {
          if (Object.keys(request).length !== 3 || !sameShutdownBinding(request.binding, shutdownBinding())) { write(socket, { ok: false, reasonCode: "control_forbidden" }); return; }
          if (typeof shutdown !== "function") { write(socket, { ok: false, reasonCode: "control_forbidden" }); return; }
          if (shutdownRequested) { write(socket, { ok: false, reasonCode: "already_shutting_down" }); return; }
          shutdownRequested = true;
          try { onEvent({ operation: "shutdown", status: "accepted", reasonCode: null, generation: null }); } catch {}
          await shutdown();
          write(socket, { ok: true, shutdown: { status: "terminal", reasonCode: null } }, () => { try { onShutdownDelivered(); } catch {} });
          return;
        }
        if (request.operation === "diagnostics") {
          if (Object.keys(request).length !== 2) { write(socket, { ok: false, reasonCode: "control_request_invalid" }); return; }
          const snapshot = parseRuntimeDiagnosticsSnapshot(await diagnostics());
          if (!snapshot) { write(socket, { ok: false, reasonCode: "runtime_diagnostics_unavailable" }); return; }
          write(socket, { ok: true, diagnostics: snapshot });
          return;
        }
        const state = request.operation === "status" ? await inspect() : await ensureReady();
        const result = publicRuntimeState(state);
        try { onEvent({ operation: request.operation, status: result.status, reasonCode: result.reasonCode, generation: result.generation }); } catch {}
        write(socket, { ok: true, runtime: result, shutdownBinding: shutdownBinding() });
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

export async function requestRuntimeControl({ endpoint, token, operation, binding, timeoutMs = 5_000, signal }) {
  if (!allowedOperations.has(operation)) throw new Error("Unsupported runtime control operation.");
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timeout); signal?.removeEventListener("abort", abort); callback(value); };
    const abort = () => { socket.destroy(); finish(reject, new Error("Runtime control request aborted.")); };
    const socket = createConnection(endpoint);
    const timeout = setTimeout(() => { socket.destroy(); finish(reject, new Error("Runtime control request timed out.")); }, timeoutMs);
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.write(`${JSON.stringify(operation === "shutdown" ? { token, operation, binding } : { token, operation })}\n`));
    socket.on("data", (chunk) => { output += chunk; });
    socket.once("error", () => finish(reject, new Error("Runtime control is unavailable.")));
    socket.once("end", () => {
      let response;
      try {
        response = JSON.parse(output);
      } catch { finish(reject, new Error("Runtime control failed.")); return; }
      if (!response?.ok) {
        finish(reject, new Error(response?.reasonCode === "control_forbidden" || response?.reasonCode === "already_shutting_down" ? "Runtime control rejected the request." : "Runtime control failed."));
        return;
      }
      if (operation === "shutdown") {
        if (response?.shutdown?.status !== "terminal") { finish(reject, new Error("Runtime control shutdown failed.")); return; }
        finish(resolve, response.shutdown);
        return;
      }
      if (operation === "diagnostics") {
        const diagnostics = parseRuntimeDiagnosticsSnapshot(response.diagnostics);
        if (!diagnostics) { finish(reject, new Error("Runtime diagnostics response is invalid.")); return; }
        finish(resolve, diagnostics);
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
