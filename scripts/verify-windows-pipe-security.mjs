import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { once } from "node:events";
import { commandFingerprint, stopDiscoveryProtocolVersion, validateStopDiscoveryRequest, verifyStopClientIdentity } from "./windows-stop-discovery.mjs";

const root = path.resolve(import.meta.dirname, "..");
const expectedImports = ["ADVAPI32.DLL", "KERNEL32.DLL"];
const allowedDeniedErrors = new Set(["EACCES", "EPERM"]);

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--") || process.argv.indexOf(name, index + 1) !== -1) throw new Error(`Invalid ${name} option.`);
  return value;
}

function assertLocalWindowsPath(value, label) {
  if (typeof value !== "string" || !path.win32.isAbsolute(value) || value.startsWith("\\\\")) throw new Error(`${label} must be an absolute local Windows path.`);
  return path.win32.normalize(value);
}

function isContained(rootPath, candidatePath) {
  const rootNormalized = path.win32.normalize(rootPath).toLowerCase();
  const candidateNormalized = path.win32.normalize(candidatePath).toLowerCase();
  return candidateNormalized.startsWith(`${rootNormalized}\\`);
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function readPeImports(file) {
  const bytes = await readFile(file);
  if (bytes.subarray(0, 2).toString("ascii") !== "MZ") throw new Error("candidate helper is not a PE file.");
  const peOffset = bytes.readUInt32LE(0x3c);
  if (bytes.subarray(peOffset, peOffset + 4).toString("ascii") !== "PE\0\0") throw new Error("candidate helper has an invalid PE header.");
  if (bytes.readUInt16LE(peOffset + 4) !== 0x8664) throw new Error("candidate helper is not AMD64.");
  const sectionCount = bytes.readUInt16LE(peOffset + 6);
  const optionalSize = bytes.readUInt16LE(peOffset + 20);
  const optional = peOffset + 24;
  if (bytes.readUInt16LE(optional) !== 0x20b) throw new Error("candidate helper is not PE32+.");
  const importRva = bytes.readUInt32LE(optional + 112 + 8);
  const sections = optional + optionalSize;
  const toOffset = (rva) => {
    for (let index = 0; index < sectionCount; index += 1) {
      const offset = sections + (index * 40);
      const virtualSize = bytes.readUInt32LE(offset + 8);
      const virtualAddress = bytes.readUInt32LE(offset + 12);
      const rawSize = bytes.readUInt32LE(offset + 16);
      const rawOffset = bytes.readUInt32LE(offset + 20);
      if (rva >= virtualAddress && rva < virtualAddress + Math.max(virtualSize, rawSize)) return rawOffset + (rva - virtualAddress);
    }
    throw new Error("candidate helper import RVA is invalid.");
  };
  const imports = [];
  if (importRva !== 0) {
    for (let descriptor = toOffset(importRva); ; descriptor += 20) {
      const nameRva = bytes.readUInt32LE(descriptor + 12);
      if (nameRva === 0) break;
      let end = toOffset(nameRva);
      while (end < bytes.length && bytes[end] !== 0) end += 1;
      imports.push(bytes.subarray(toOffset(nameRva), end).toString("ascii").toUpperCase());
    }
  }
  return [...new Set(imports)].sort();
}

async function runHelper(helper, args, { timeoutMs = 2_000 } = {}) {
  const child = spawn(helper, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end();
  return new Promise((resolve) => {
    const timeout = setTimeout(async () => {
      if (child.exitCode === null) { child.kill(); await once(child, "exit"); }
      resolve({ code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);
    child.once("exit", (code) => { clearTimeout(timeout); resolve({ code, stdout, stderr, timedOut: false }); });
  });
}

async function assertSecurityContract() {
  const source = await readFile(path.join(root, "native", "windows-pipe-security-adapter", "ued_windows_pipe_security_adapter.cpp"), "utf8");
  assert.match(source, /constexpr DWORD kPipeRights = FILE_READ_DATA \| FILE_WRITE_DATA \| FILE_READ_ATTRIBUTES \| FILE_WRITE_ATTRIBUTES \| READ_CONTROL \| SYNCHRONIZE/, "adapter must use precise pipe rights");
  assert.match(source, /const std::wstring account = L"NT SERVICE\\\\" \+ serviceName/, "adapter must resolve only a named service SID");
  assert.match(source, /EXPLICIT_ACCESSW entries\[2\]\{\}/, "adapter must define exactly SYSTEM and service-SID ACE entries");
  assert.match(source, /entries\[0\]\.grfAccessPermissions = GENERIC_ALL/, "SYSTEM ACE must retain full control");
  assert.match(source, /entries\[1\]\.grfAccessPermissions = kPipeRights/, "service SID ACE must retain precise pipe rights");
  assert.match(source, /PIPE_REJECT_REMOTE_CLIENTS/, "adapter must reject remote clients");
  assert.match(source, /GetNamedPipeClientProcessId/, "adapter must use the OS-connected client identity");
  assert.doesNotMatch(source, /Everyone|Authenticated Users|BUILTIN\\\\Administrators|\bUsers\b|HDUED/i, "adapter must not grant a broad interactive principal");
  assert.doesNotMatch(source, /CreateProcessW|cmd\.exe|PowerShell|shell:\s*true|TerminateJobObject|taskkill/i, "adapter must not add a shell or process-control bypass");
}

function assertPureProtocolIdentityContract() {
  const request = { protocolVersion: stopDiscoveryProtocolVersion, operation: "discover-shutdown", clientNonce: "A".repeat(32) };
  assert.deepEqual(validateStopDiscoveryRequest(request), { ok: true });
  assert.equal(validateStopDiscoveryRequest({ ...request, clientNonce: "bad" }).ok, false, "malformed request is rejected");
  const expected = { executable: process.execPath, parentExecutable: process.execPath, parentPid: process.pid };
  expected.commandFingerprint = commandFingerprint({ executable: expected.executable, script: "C:\\staging\\stop-client.mjs" });
  const identity = { authenticated: true, pid: process.pid + 1, creationTime: "1", executable: expected.executable, commandFingerprint: expected.commandFingerprint, parentPid: expected.parentPid, parentExecutable: expected.parentExecutable };
  assert.deepEqual(verifyStopClientIdentity(identity, expected), { ok: true });
  assert.equal(verifyStopClientIdentity({ ...identity, parentPid: 0 }, expected).ok, false, "identity mismatch is rejected");
}

async function assertCandidateIdentity({ helperPath, manifestPath, stagingRoot }) {
  const [helper, manifest] = await Promise.all([realpath(helperPath), realpath(manifestPath)]);
  if (!isContained(stagingRoot, helper) || !isContained(stagingRoot, manifest)) throw new Error("candidate helper and manifest must remain inside the explicit staging root.");
  const details = await lstat(helper);
  if (!details.isFile() || details.isSymbolicLink() || details.nlink > 1) throw new Error("candidate helper must be a regular unlinked file.");
  if (path.win32.basename(helper) !== "ued-windows-pipe-security-adapter.exe") throw new Error("candidate helper file name is invalid.");
  const parsed = JSON.parse(await readFile(manifest, "utf8"));
  if (parsed?.version !== 1 || parsed?.architecture !== "x64" || !/^[a-f0-9]{64}$/.test(parsed?.sha256 || "")) throw new Error("candidate manifest identity is invalid.");
  const sha256 = createHash("sha256").update(await readFile(helper)).digest("hex");
  assert.equal(parsed.sha256, sha256, "candidate manifest hash must match helper bytes");
  assert.deepEqual(await readPeImports(helper), expectedImports, "candidate helper imports must match the approved system dependency set");
  return { helper, manifest, sha256 };
}

async function assertStartupAndDeniedCaller({ helper, serviceName }) {
  const missing = await runHelper(helper, ["--endpoint", "\\\\.\\pipe\\ued-b4a-missing"]);
  assert.equal(missing.code, 64, "missing required arguments must fail closed");
  const invalid = await runHelper(helper, ["--endpoint", `\\\\.\\pipe\\ued-b4a-invalid-${randomUUID()}`, "--service-name", `UEDMissing${randomUUID().replaceAll("-", "")}`, "--expected-client-exe", process.execPath, "--expected-client-script", "C:\\staging\\client.mjs", "--expected-parent-pid", String(process.pid), "--expected-parent-exe", process.execPath, "--expected-command-fingerprint", "b4a-invalid-service"]);
  assert.equal(invalid.code, 65, "unresolvable Service SID must fail closed");

  const endpoint = `\\\\.\\pipe\\ued-b4a-${randomUUID()}`;
  const child = spawn(helper, ["--endpoint", endpoint, "--service-name", serviceName, "--expected-client-exe", process.execPath, "--expected-client-script", "C:\\staging\\client.mjs", "--expected-parent-pid", String(process.pid), "--expected-parent-exe", process.execPath, "--expected-command-fingerprint", "b4a-denied-interactive"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false });
  let stdout = "";
  child.stdout.setEncoding("utf8"); child.stdout.on("data", (chunk) => { stdout += chunk; });
  try {
    let denied = null;
    for (let attempt = 0; attempt < 20 && !denied; attempt += 1) {
      denied = await new Promise((resolve) => {
        const socket = createConnection(endpoint);
        socket.once("connect", () => { socket.destroy(); resolve("CONNECTED"); });
        socket.once("error", (error) => resolve(error.code || "OTHER"));
        socket.setTimeout(200, () => { socket.destroy(); resolve("TIMEOUT"); });
      });
      if (!allowedDeniedErrors.has(denied)) { await delay(50); denied = null; }
    }
    assert.ok(denied && allowedDeniedErrors.has(denied), "interactive staging caller must be denied by the pipe DACL");
    assert.equal(stdout, "", "denied caller must not reach the protected handler");
    return denied;
  } finally {
    if (child.exitCode === null) { child.kill(); await once(child, "exit"); }
  }
}

assertPureProtocolIdentityContract();
if (process.platform !== "win32" || process.arch !== "x64") {
  console.log("PURE REQUEST / IDENTITY FUNCTIONAL CONTRACT: PASS");
  console.log("PIPE B4A COMPONENT GATE: NOT RUN (requires Windows x64 candidate helper)");
  process.exit(0);
}

const helperPath = assertLocalWindowsPath(option("--candidate-helper"), "--candidate-helper");
const manifestPath = assertLocalWindowsPath(option("--candidate-manifest"), "--candidate-manifest");
const stagingRoot = assertLocalWindowsPath(option("--staging-root"), "--staging-root");
const serviceName = option("--test-service-name") ?? "W32Time";
if (!/^[A-Za-z0-9_-]{1,80}$/.test(serviceName) || serviceName === "UEDAssetHub") throw new Error("--test-service-name must name an existing non-UEDAssetHub staging service SID.");

await assertSecurityContract();
const candidate = await assertCandidateIdentity({ helperPath, manifestPath, stagingRoot });
const denied = await assertStartupAndDeniedCaller({ helper: candidate.helper, serviceName });
console.log("B4A CANDIDATE/MANIFEST IDENTITY CHECK: PASS");
console.log("B4A PE X64 / IMPORTS: PASS");
console.log("B4A STARTUP / INVALID INPUT: PASS");
console.log("B4A DACL CONTRACT: PASS");
console.log("B4A BROAD PRINCIPAL ABSENCE: PASS");
console.log("UNAUTHORIZED INTERACTIVE CALLER DENIAL: PASS");
console.log(`INTERACTIVE CALLER RESULT: ${denied}`);
console.log("DENIED CALLER REACHED PROTECTED HANDLER: NO");
console.log("PURE REQUEST / IDENTITY FUNCTIONAL CONTRACT: PASS");
console.log("AUTHORIZED SERVICE-SID PIPE CONNECTION: DEFERRED TO E2-B4B");
console.log("SYSTEM POSITIVE ACCESS: DEFERRED TO E2-B4B");
console.log("REAL SERVICE TOKEN / DACL INTEGRATION: DEFERRED TO E2-B4B");
console.log("PIPE NATIVE HANDLER/RESPONSE E2E: DEFERRED TO E2-B4B");
console.log("PIPE RUNTIME INTEGRATION: DEFERRED TO E2-B4B");
console.log("PIPE B4A COMPONENT GATE: PASS");
