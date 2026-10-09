import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { runtimeControlTransport } from "./runtime-control-transport.mjs";

export const stopDiscoveryProtocolVersion = 1;
export const defaultWindowsServiceName = "UEDAssetHub";
const maximumMessageBytes = 4 * 1024;
const maximumAdapterLineBytes = 16 * 1024;
const transport = runtimeControlTransport({ platform: "win32" });

function normalizeIdentityExecutable(value) {
  if (typeof value !== "string" || !value) return "";
  const normalized = /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\") ? path.win32.resolve(value) : path.resolve(value);
  return normalized.toLocaleLowerCase("en-US");
}

export function windowsServiceMode({ platform = process.platform, environment = process.env } = {}) {
  return platform === "win32" && environment.UED_WINDOWS_SERVICE_MODE === "true";
}

export function stopDiscoveryEndpoint(serviceName = defaultWindowsServiceName) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(serviceName)) throw new Error("Windows service name is invalid.");
  return `\\\\.\\pipe\\ued-asset-hub-stop-discovery-${serviceName.toLowerCase()}`;
}

export function commandFingerprint({ executable, script }) {
  return createHash("sha256").update(`${normalizeIdentityExecutable(executable)}\n${normalizeIdentityExecutable(script)}`).digest("hex");
}

export function validateStopDiscoveryRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) return { ok: false, reasonCode: "discovery_request_invalid" };
  if (Object.keys(request).length !== 3 || request.protocolVersion !== stopDiscoveryProtocolVersion || request.operation !== "discover-shutdown" || typeof request.clientNonce !== "string" || !/^[A-Za-z0-9_-]{16,256}$/.test(request.clientNonce)) return { ok: false, reasonCode: "discovery_request_invalid" };
  return { ok: true };
}

export function verifyStopClientIdentity(identity, expected) {
  if (!identity || !expected || identity.authenticated !== true || !Number.isInteger(identity.pid) || identity.pid < 1 || typeof identity.creationTime !== "string" || typeof identity.executable !== "string" || typeof identity.commandFingerprint !== "string") return { ok: false, reasonCode: "discovery_client_identity_invalid" };
  if (normalizeIdentityExecutable(identity.executable) !== normalizeIdentityExecutable(expected.executable)) return { ok: false, reasonCode: "discovery_client_executable_mismatch" };
  if (identity.commandFingerprint !== expected.commandFingerprint) return { ok: false, reasonCode: "discovery_client_command_mismatch" };
  if (!Number.isInteger(identity.parentPid) || identity.parentPid !== expected.parentPid || normalizeIdentityExecutable(identity.parentExecutable) !== normalizeIdentityExecutable(expected.parentExecutable)) return { ok: false, reasonCode: "discovery_client_parent_mismatch" };
  return { ok: true };
}

function sendLine(stream, value) {
  stream.write(`${JSON.stringify(value)}\n`);
}

function parseAdapterLine(line) {
  if (Buffer.byteLength(line) > maximumAdapterLineBytes) throw new Error("Pipe security adapter returned an oversized message.");
  const value = JSON.parse(line);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Pipe security adapter returned an invalid message.");
  return value;
}

export function createWindowsStopDiscoveryBridge({ adapterPath, serviceName = defaultWindowsServiceName, clientExecutable, clientScript, parentPid, parentExecutable, capability, onEvent = () => {}, platform = process.platform }) {
  if (platform !== "win32") throw new Error("Windows stop discovery is only available on Windows.");
  if (!existsSync(adapterPath)) throw new Error("Windows Pipe Security Adapter is missing.");
  const expected = { executable: clientExecutable, commandFingerprint: commandFingerprint({ executable: clientExecutable, script: clientScript }), parentPid, parentExecutable };
  const endpoint = stopDiscoveryEndpoint(serviceName);
  let stopping = false;
  let child = null;
  let restartTimer = null;

  const start = () => {
    if (stopping || child) return;
    child = spawn(adapterPath, ["--endpoint", endpoint, "--service-name", serviceName, "--expected-client-exe", path.resolve(clientExecutable), "--expected-client-script", path.resolve(clientScript), "--expected-parent-pid", String(parentPid), "--expected-parent-exe", path.resolve(parentExecutable), "--expected-command-fingerprint", expected.commandFingerprint], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > maximumAdapterLineBytes) { child?.stdin.destroy(); return; }
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      const line = output.slice(0, newline);
      output = output.slice(newline + 1);
      try {
        const message = parseAdapterLine(line);
        if (message.event !== "request") return;
        const requestCheck = validateStopDiscoveryRequest(message.request);
        const identityCheck = verifyStopClientIdentity(message.client, expected);
        if (!requestCheck.ok || !identityCheck.ok) {
          sendLine(child.stdin, { ok: false, reasonCode: requestCheck.ok ? identityCheck.reasonCode : requestCheck.reasonCode });
          return;
        }
        sendLine(child.stdin, { ok: true, capability: { protocolVersion: stopDiscoveryProtocolVersion, ...capability() } });
        try { onEvent({ operation: "discover-shutdown", status: "accepted", reasonCode: null, generation: capability().generation }); } catch {}
        try { onEvent({ operation: "stop-discovery-client", status: "connected-authenticated", reasonCode: null, generation: capability().generation }); } catch {}
      } catch {
        child?.stdin.destroy();
      }
    });
    child.once("exit", () => {
      child = null;
      if (!stopping) restartTimer = setTimeout(start, 20);
    });
  };

  return {
    endpoint,
    start: () => start(),
    stop: async () => {
      stopping = true;
      if (restartTimer) clearTimeout(restartTimer);
      if (!child) return;
      child.stdin.end();
      await new Promise((resolve) => {
        child.once("exit", resolve);
        const socket = transport.connect(endpoint);
        socket.once("connect", () => socket.end("{}\n"));
        socket.once("error", () => resolve());
      });
    }
  };
}

export async function discoverShutdownCapability({ endpoint, clientNonce, timeoutMs = 10_000 }) {
  const request = { protocolVersion: stopDiscoveryProtocolVersion, operation: "discover-shutdown", clientNonce };
  if (!validateStopDiscoveryRequest(request).ok) throw new Error("Stop discovery request is invalid.");
  return new Promise((resolve, reject) => {
    let output = "";
    let settled = false;
    const socket = transport.connect(endpoint);
    const finish = (callback, value) => { if (settled) return; settled = true; clearTimeout(timeout); callback(value); };
    const timeout = setTimeout(() => { socket.destroy(); finish(reject, new Error("Stop discovery timed out.")); }, timeoutMs);
    socket.setEncoding("utf8");
    socket.once("connect", () => socket.end(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => { output += chunk; if (Buffer.byteLength(output) > maximumMessageBytes) socket.destroy(); });
    socket.once("error", () => finish(reject, new Error("Stop discovery is unavailable.")));
    socket.once("end", () => {
      try {
        const response = JSON.parse(output);
        if (!response?.ok || !response.capability || typeof response.capability.endpoint !== "string" || typeof response.capability.token !== "string") throw new Error("Stop discovery rejected the request.");
        finish(resolve, response.capability);
      } catch (error) { finish(reject, error instanceof Error ? error : new Error("Stop discovery failed.")); }
    });
  });
}
