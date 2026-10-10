import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commandFingerprint, defaultWindowsServiceName, stopDiscoveryEndpoint, stopDiscoveryProtocolVersion, validateStopDiscoveryRequest, verifyStopClientIdentity, windowsServiceMode } from "./windows-stop-discovery.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function testWinSwTemplate() {
  const [template, artifactText] = await Promise.all([
    readFile(path.join(root, "service", "windows", "UEDAssetHub.xml.template"), "utf8"),
    readFile(path.join(root, "service", "windows", "winsw-2.12.0-x64.artifact.json"), "utf8")
  ]);
  const artifact = JSON.parse(artifactText);
  assert.deepEqual({ version: artifact.version, architecture: artifact.architecture, installName: artifact.installName }, { version: "2.12.0", architecture: "x64", installName: "UEDAssetHub.exe" }, "WinSW wrapper is pinned to 2.12.0 x64");
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/, "WinSW artifact has an exact SHA-256");
  assert.match(template, /<startarguments>/, "WinSW start uses startarguments");
  assert.match(template, /<stoparguments>/, "WinSW stop uses stoparguments");
  assert.doesNotMatch(template, /<arguments>/, "WinSW does not share start and stop arguments");
  assert.match(template, /node\\22\.23\.3\\node\.exe/, "WinSW pins Node 22.23.3");
  assert.match(template, /scripts\\start-host\.mjs/, "WinSW starts the Host directly");
  assert.match(template, /windows-managed-shutdown-client\.mjs 90000/, "WinSW uses the managed shutdown client");
  assert.match(template, /<workingdirectory>\{\{UED_ROOT\}\}\\current<\/workingdirectory>/, "WinSW working directory is current");
  assert.match(template, /<stoptimeout>120 sec<\/stoptimeout>/, "outer stop timeout is bounded");
  assert.match(template, /restart" delay="30 sec"[\s\S]*restart" delay="60 sec"[\s\S]*restart" delay="5 min"[\s\S]*none/, "restart exhaustion stops after three failures");
  assert.match(template, /<resetfailure>1 hour<\/resetfailure>/, "stable runtime resets failure count");
  assert.match(template, /UED_WINDOWS_SERVICE_MODE" value="true"/, "service mode is explicit");
  assert.match(template, /<id>\{\{UED_SERVICE_NAME\}\}<\/id>/, "WinSW service identity comes from the single rendered authority");
  assert.match(template, /UED_WINDOWS_SERVICE_NAME" value="\{\{UED_SERVICE_NAME\}\}"/, "Host receives the rendered service identity");
  assert.match(template, /UED_B4B_RUN_ID" value="\{\{UED_B4B_RUN_ID\}\}"/, "B4B run identity is rendered explicitly");
  assert.match(template, /UED_WINSW_EXECUTABLE" value="\{\{UED_ROOT\}\}\\service\\\{\{UED_SERVICE_NAME\}\}\.exe"/, "Host verifies the expected wrapper executable");
  assert.match(template, /HOST_BIND_HOST" value="127\.0\.0\.1"/, "service edge remains loopback only");
  assert.doesNotMatch(template, /ADMIN_PASSWORD|DEEPSEEK_API_KEY|ADMIN_SESSION_SECRET|AGENT_GATEWAY_TOKEN|RUNTIME_CONTROL_TOKEN|PRIVATE KEY/i, "template has no secrets");
  assert.doesNotMatch(template, /npm\.cmd|pnpm\.cmd|cmd\.exe|powershell/i, "template never wraps production commands in a shell");
}

function testDiscoveryProtocolAndIdentity() {
  const request = { protocolVersion: stopDiscoveryProtocolVersion, operation: "discover-shutdown", clientNonce: "A".repeat(32) };
  assert.deepEqual(validateStopDiscoveryRequest(request), { ok: true });
  assert.equal(validateStopDiscoveryRequest({ ...request, pid: 123 }).ok, false, "caller supplied PID is not part of the protocol");
  assert.equal(validateStopDiscoveryRequest({ ...request, operation: "exec" }).ok, false, "discovery has no arbitrary command dispatch");
  assert.equal(stopDiscoveryEndpoint(defaultWindowsServiceName), "\\\\.\\pipe\\ued-asset-hub-stop-discovery-uedassethub");
  assert.equal(windowsServiceMode({ platform: "darwin", environment: { UED_WINDOWS_SERVICE_MODE: "true" } }), false, "POSIX never enables Windows service mode");
  const expected = { executable: "C:\\service\\node.exe", parentExecutable: "C:\\service\\UEDAssetHub.exe", parentPid: 77 };
  expected.commandFingerprint = commandFingerprint({ executable: expected.executable, script: "/service/shutdown.mjs" });
  const identity = { authenticated: true, pid: 88, creationTime: "1", executable: expected.executable, commandFingerprint: expected.commandFingerprint, parentPid: 77, parentExecutable: expected.parentExecutable };
  assert.deepEqual(verifyStopClientIdentity(identity, expected), { ok: true });
  assert.equal(verifyStopClientIdentity({ ...identity, pid: 0 }, expected).ok, false, "PID alone cannot establish identity");
  assert.equal(verifyStopClientIdentity({ ...identity, executable: "/other.exe" }, expected).ok, false, "executable mismatch is denied");
  assert.equal(verifyStopClientIdentity({ ...identity, commandFingerprint: "stale" }, expected).ok, false, "command mismatch is denied");
  assert.equal(verifyStopClientIdentity({ ...identity, parentPid: 1 }, expected).ok, false, "parent mismatch is denied");
}

async function testNativeAdapterScope() {
  const source = await readFile(path.join(root, "native", "windows-pipe-security-adapter", "ued_windows_pipe_security_adapter.cpp"), "utf8");
  assert.match(source, /PIPE_REJECT_REMOTE_CLIENTS/, "adapter rejects remote clients");
  assert.match(source, /GetNamedPipeClientProcessId/, "adapter obtains OS-connected client PID");
  assert.match(source, /LookupAccountNameW/, "adapter resolves the service SID");
  assert.match(source, /FILE_READ_DATA \| FILE_WRITE_DATA/, "adapter uses precise pipe rights");
  assert.match(source, /EXPLICIT_ACCESSW entries\[2\]/, "adapter has exactly SYSTEM and named-Service-SID ACE slots");
  assert.doesNotMatch(source, /Everyone|Authenticated Users|BUILTIN\\Administrators|\bUsers\b|HDUED/i, "adapter has no broad interactive pipe principal");
  assert.doesNotMatch(source, /TerminateJobObject|CreateJobObject|taskkill|CreateProcessW|PowerShell|cmd\.exe/i, "adapter is not a process/runtime manager");
}

async function testServiceShutdownBoundary() {
  const [host, client, discovery, control, routes, stagingShutdown] = await Promise.all([
    readFile(path.join(root, "scripts", "host-supervisor.mjs"), "utf8"),
    readFile(path.join(root, "scripts", "windows-managed-shutdown-client.mjs"), "utf8"),
    readFile(path.join(root, "scripts", "windows-stop-discovery.mjs"), "utf8"),
    readFile(path.join(root, "scripts", "runtime-control-bridge.mjs"), "utf8"),
    readdir(path.join(root, "src", "app", "api", "runtime")),
    readFile(path.join(root, "src", "app", "api", "staging-shutdown", "route.ts"), "utf8")
  ]);
  assert.match(host, /serviceMode \? "127\.0\.0\.1"/, "Windows service edge cannot bind LAN");
  assert.match(host, /resolveWindowsServiceIdentity/, "Host resolves one service identity authority");
  assert.match(client, /resolveWindowsServiceIdentity/, "shutdown client resolves the same service identity authority");
  assert.match(host, /core\.stopForShutdown\(\)/, "Host keeps RuntimeLifecycleCore shutdown ordering");
  assert.match(control, /shutdownBinding/, "Runtime Control binds shutdown to the current generation");
  assert.match(client, /discoverShutdownCapability/, "stop client only discovers an in-memory capability");
  assert.match(client, /status=exited exitCode=\$\{code\}/, "stop client exposes its phase and exit code without error contents");
  assert.match(host, /child_exit_code_nonzero/, "Host lifecycle records a stable child exit reason code");
  assert.match(host, /stderrRef/, "Host lifecycle records the inherited child stderr reference");
  assert.doesNotMatch(client, /taskkill|TerminateJob|exec\(|spawn\(|readFile|writeFile/i, "shutdown client cannot manage processes or persist data");
  assert.doesNotMatch(discovery, /writeFile|readFile|exec\(|spawnSync|child\.kill/i, "discovery never persists capability or kills a process");
  assert.equal(routes.includes("shutdown"), false, "no public Runtime shutdown API exists");
  assert.match(stagingShutdown, /UED_STAGING_SHUTDOWN_ENABLED !== "true"/, "staging maintenance shutdown is disabled unless explicitly enabled");
  assert.match(stagingShutdown, /isAdminRequest\(request\)/, "staging maintenance shutdown requires an admin session");
  assert.match(stagingShutdown, /acceptsSameOriginJsonMutation\(request\)/, "staging maintenance shutdown rejects cross-origin requests");
  assert.match(stagingShutdown, /invokeRuntimeShutdown\(\)/, "staging maintenance shutdown reuses the bound Supervisor lifecycle");
}

async function testB4aB4bBoundary() {
  const [readme, harness] = await Promise.all([
    readFile(path.join(root, "native", "windows-pipe-security-adapter", "README.md"), "utf8"),
    readFile(path.join(root, "scripts", "windows-service-runtime-control-harness.ps1"), "utf8")
  ]);
  assert.match(readme, /B4A PASS != real service topology PASS/, "B4A does not overclaim real service topology");
  assert.match(readme, /AUTHORIZED SERVICE-SID PIPE CONNECTION: DEFERRED TO E2-B4B/, "authorized Service-SID positive access is deferred");
  assert.match(harness, /B4B ONLY: authorized Service-SID pipe connection/, "native service harness preserves the B4B positive-access boundary");
}

await testWinSwTemplate();
testDiscoveryProtocolAndIdentity();
await testNativeAdapterScope();
await testServiceShutdownBoundary();
await testB4aB4bBoundary();
console.log("[UED Agent] Windows service runtime-control static checks passed.");
