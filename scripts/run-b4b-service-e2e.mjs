import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { access, appendFile, mkdir, readFile, readdir, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { applyCredentialAcl, validateCredentialAcl } from "./windows-credential-acl.mjs";
import { loadWindowsCredentialBundle } from "./windows-credential-bundle.mjs";
import { cleanupB4bPrestartFailure, createB4bServiceLifecycle, isB4bPrestartCredentialGatePassed, transitionB4bServiceLifecycle } from "./b4b-service-identity-lifecycle.mjs";
import { validateCandidateDpapiHelper, inspectB4bSecretLeak, provisionCredentialBundle } from "./windows-credential-provisioner.mjs";
import { resolveInstalledB4bServiceSid } from "./windows-service-identity.mjs";
import { smokeCandidateHostRuntimeImport, verifyCandidateRuntimeObservability } from "./candidate-runtime-closure.mjs";

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => value.startsWith("--") && values[index + 1] ? [...pairs, [value.slice(2), values[index + 1]]] : pairs, []));
const runId = options["run-id"], b4bRoot = path.win32.resolve(options["b4b-root"] || ""), candidateDigest = options["candidate-digest"];
if (process.platform !== "win32" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{6,46}[A-Za-z0-9])?$/.test(runId || "") || b4bRoot.toLowerCase() !== path.win32.resolve("D:\\UED-Asset-Hub-Staging\\b4b", runId).toLowerCase() || !/^[a-f0-9]{64}$/u.test(candidateDigest || "")) throw new Error("B4B service E2E identity is invalid.");

const lifecycleAuthority = createB4bServiceLifecycle(runId);
const lifecycleHolder = { state: lifecycleAuthority };
const serviceName = lifecycleAuthority.identity.serviceName;
const candidateRoot = path.join(b4bRoot, "current");
const winSwPath = path.join(b4bRoot, "service", serviceName + ".exe");
const serviceConfigPath = path.join(b4bRoot, "service", serviceName + ".xml");
const sourceRoot = path.join(b4bRoot, "dsh-git-authority-v2");
const runtimeRoot = path.join(b4bRoot, "dsh-runtime-v2");
const credentialDirectory = path.join(b4bRoot, "credentials");
const bundlePath = path.join(credentialDirectory, serviceName + ".credentials.dpapi");
const evidencePath = path.join(b4bRoot, "logs", "b4b-service-e2e.json");
const progressPath = path.join(b4bRoot, "logs", "b4b-service-e2e-progress.ndjson");
const expectedCandidateDigest = candidateDigest;
const attemptId = randomUUID();
const expectedWinSwSha256 = "05b82d46ad331cc16bdc00de5c6332c1ef818df8ceefcd49c726553209b3a0da";
const expectedNodeSha256 = "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e";
const secretEnvironmentNames = ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "AGENT_GATEWAY_TOKEN", "TEST_ENV_ENCRYPTION_KEY", "DEEPSEEK_API_KEY"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let stage = "PRECHECK";
let serviceInstalled = false;
let startAttempted = false;
let hostEverObserved = false;
let controlledStopCompleted = false;
let stopRequestAttempted = false;
let stopRequestTime = null;
let stopClientExitCode = null;
let postStopNewGenerationCount = null;
let provisioned;
let loadedCredentials;
let lifecycleIdentity;
let sourceIdentity;
let serviceSid;

function fail(message) { throw new Error(message); }
function quotePowerShell(value) { return "'" + String(value).replaceAll("'", "''") + "'"; }
function run(command, args, timeout = 30_000) {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, shell: false, timeout });
  if (result.error || result.status !== 0) fail("controlled B4B command failed: " + path.basename(command));
  return String(result.stdout || "").trim();
}
function runPowerShellJson(lines) {
  const script = ["$ErrorActionPreference='Stop'", "[Console]::OutputEncoding=[Text.UTF8Encoding]::new()", ...lines].join("\n");
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  const output = run("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded]);
  return JSON.parse(output);
}
async function progress(name, status = "PASS", details = {}) {
  stage = name;
  await appendFile(progressPath, JSON.stringify({ at: new Date().toISOString(), attemptId, stage: name, status, ...details }) + "\n", { encoding: "utf8" });
}
async function fileExists(file) { try { await access(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; } }
function windowsState() {
  const serviceLiteral = quotePowerShell(serviceName), rootLiteral = quotePowerShell(b4bRoot);
  const script = [
    "$name=" + serviceLiteral,
    "$root=" + rootLiteral,
    "$service=Get-CimInstance Win32_Service | Where-Object Name -eq $name",
    "$formal=Get-CimInstance Win32_Service | Where-Object Name -eq 'UEDAssetHub'",
    "$hostPath=Join-Path $root 'current\\scripts\\start-host.mjs'",
    "$all=@(Get-CimInstance Win32_Process)",
    "$hosts=@($all | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($hostPath,[StringComparison]::OrdinalIgnoreCase) -ge 0 })",
    "$front=@($hosts | ForEach-Object { [int]$_.ProcessId })",
    "$owned=New-Object System.Collections.Generic.List[int]",
    "while($front.Count -gt 0){$next=@();foreach($item in $all){$pidValue=[int]$item.ProcessId;if(($front -contains [int]$item.ParentProcessId) -and -not $owned.Contains($pidValue)){$owned.Add($pidValue);$next+=,$pidValue}};$front=$next}",
    "$ports=@(3027,3028,3080,3081,3082)",
    "$listeners=@([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $ports -contains $_.Port } | ForEach-Object { [int]$_.Port } | Sort-Object -Unique)",
    "$pipeRoot='\\\\.\\pipe\\'",
    "$stopDiscoveryPipe='ued-asset-hub-stop-discovery-' + $name.ToLowerInvariant()",
    "$pipes=@(Get-ChildItem -LiteralPath $pipeRoot -ErrorAction Stop | Where-Object { $_.Name -eq $stopDiscoveryPipe } | ForEach-Object { $_.Name })",
    "[pscustomobject]@{serviceExists=($null -ne $service);serviceState=$(if($service){$service.State}else{$null});startMode=$(if($service){$service.StartMode}else{$null});servicePath=$(if($service){$service.PathName}else{$null});servicePid=$(if($service){[int]$service.ProcessId}else{0});formalServiceExists=($null -ne $formal);hostProcessIds=@($hosts | ForEach-Object { [int]$_.ProcessId });ownedChildProcessIds=@($owned.ToArray());listeningPorts=$listeners;pipeNames=$pipes}|ConvertTo-Json -Compress -Depth 5"
  ];
  return runPowerShellJson(script);
}
async function waitFor(label, action, timeoutMs = 300_000, intervalMs = 1_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return await action(); } catch {}
    await delay(intervalMs);
  }
  fail(label + " timed out.");
}
function assertNoHost(state) {
  if (state.hostProcessIds.length !== 0 || state.ownedChildProcessIds.length !== 0) fail("B4B Host or owned child exists before credential gate.");
}
function assertServiceIdentity(state) {
  if (!state.serviceExists || state.serviceState !== "Stopped" || state.startMode !== "Manual") fail("B4B service is not installed, stopped, and manual.");
  const installedPath = String(state.servicePath || "").replace(/^"|"$/gu, "").toLowerCase();
  if (installedPath !== winSwPath.toLowerCase()) fail("SCM service path is not the exact B4B WinSW binary.");
}
function assertPortsAndPipesClear(state) {
  if (state.listeningPorts.length !== 0) fail("B4B target port is occupied.");
  if (state.pipeNames.length !== 0) fail("B4B runtime pipe exists unexpectedly.");
}
async function waitForServiceState(expectedState, timeoutMs = 120_000) {
  return await waitFor("SCM " + expectedState, async () => {
    const state = windowsState();
    if (!state.serviceExists || state.serviceState !== expectedState) throw new Error("SCM state pending.");
    return state;
  }, timeoutMs);
}
async function removeCredentialDirectory() {
  if (await fileExists(bundlePath)) fail("protected bundle remains after ownership cleanup.");
  if (!(await fileExists(credentialDirectory))) return;
  const entries = await readdir(credentialDirectory);
  if (entries.length !== 0) fail("credential directory contains an unowned residual.");
  await rmdir(credentialDirectory);
}
async function cleanupAfterPrestartFailure() {
  const before = windowsState();
  if (before.serviceState === "Running" || before.hostProcessIds.length !== 0 || before.ownedChildProcessIds.length !== 0) fail("pre-start cleanup refused because a Host process may have started.");
  if (!serviceInstalled) return;
  await cleanupB4bPrestartFailure({
    lifecycle: lifecycleHolder.state,
    hostStarted: false,
    removeOwnedCredential: async () => {
      if (provisioned) await provisioned.cleanup({ lifecycle: lifecycleHolder.state });
      await removeCredentialDirectory();
    },
    uninstallService: async (name) => {
      if (name !== serviceName) fail("pre-start cleanup service identity mismatch.");
      if (windowsState().serviceExists) run(winSwPath, ["uninstall"]);
    },
    inspectResiduals: async (name) => {
      if (name !== serviceName) fail("pre-start cleanup residual identity mismatch.");
      const state = windowsState();
      return { serviceExists: state.serviceExists, hostProcessCount: state.hostProcessIds.length, ownedChildProcessCount: state.ownedChildProcessIds.length, b4bPipeExists: state.pipeNames.length !== 0, formalMutation: state.formalServiceExists };
    }
  });
}
async function uninstallAndClean() {
  const state = await waitForServiceState("Stopped");
  if (state.hostProcessIds.length !== 0 || state.ownedChildProcessIds.length !== 0) fail("B4B process tree remains after controlled stop.");
  run(winSwPath, ["uninstall"]);
  await waitFor("SCM uninstall", async () => { const current = windowsState(); if (current.serviceExists) throw new Error("SCM service remains."); return current; }, 30_000, 500);
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "UNINSTALLED", { serviceExists: false });
  await progress("UNINSTALLED");
  if (provisioned) await provisioned.cleanup({ lifecycle: lifecycleHolder.state });
  await removeCredentialDirectory();
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "CREDENTIAL_CLEANED", { protectedBundleResidual: false, credentialDirectoryResidual: false });
  await progress("CREDENTIAL_CLEANED");
}
let finalReport;
try {
  await mkdir(path.join(b4bRoot, "logs"), { recursive: true });
  if (await fileExists(evidencePath)) fail("B4B E2E evidence already exists for this run.");
  await progress("PRECHECK");
  const deployment = JSON.parse(await readFile(path.join(candidateRoot, "deployment.manifest.json"), "utf8"));
  if (deployment?.artifactSet?.digest !== expectedCandidateDigest) fail("B4B Candidate identity does not match the authorized digest.");
  if (sha256(await readFile(winSwPath)) !== expectedWinSwSha256) fail("B4B WinSW identity does not match the authorized binary.");
  const nodePath = path.join(b4bRoot, "service", "node", "22.23.3", "node.exe");
  if (sha256(await readFile(nodePath)) !== expectedNodeSha256) fail("B4B Node identity does not match the pinned artifact.");
  const candidateRuntimeClosure = await smokeCandidateHostRuntimeImport({ candidateRoot, nodeExe: nodePath, environment: process.env });
  if (candidateRuntimeClosure.missingRuntimeModuleCount !== 0 || candidateRuntimeClosure.sourceTreeFallback !== false || candidateRuntimeClosure.nodePathFallback !== false) fail("Candidate Host runtime dependency closure gate failed.");
  await progress("CANDIDATE_HOST_RUNTIME_CLOSURE");
  const observabilityPrestartGate = await verifyCandidateRuntimeObservability({ candidateRoot });
  await progress("OBSERVABILITY_PRESTART_GATE", "PASS", observabilityPrestartGate);
  const serviceConfig = await readFile(serviceConfigPath, "utf8");
  const configChecks = [
    '<id>' + serviceName + '</id>',
    '<startmode>Manual</startmode>',
    '<executable>' + path.join(b4bRoot, "service", "node", "22.23.3", "node.exe") + '</executable>',
    '<startarguments>' + path.join(candidateRoot, "scripts", "start-host.mjs") + '</startarguments>',
    '<workingdirectory>' + candidateRoot + '</workingdirectory>',
    '<env name="UED_B4B_RUN_ID" value="' + runId + '" />',
    '<env name="NODE_ENV" value="production" />',
    '<env name="DATA_DIR" value="' + path.join(b4bRoot, "runtime-data") + '" />',
    '<env name="DSH_SOURCE_DIR" value="' + sourceRoot + '" />',
    '<env name="DSH_RUNTIME_SOURCE_DIR" value="' + runtimeRoot + '" />',
    '<env name="UED_CREDENTIAL_BUNDLE_PATH" value="' + bundlePath + '" />'
  ];
  if (configChecks.some((value) => !serviceConfig.includes(value)) || /\{\{[^}]+\}\}/u.test(serviceConfig) || /name="(?:ADMIN_PASSWORD|ADMIN_SESSION_SECRET|AGENT_GATEWAY_TOKEN|TEST_ENV_ENCRYPTION_KEY|DEEPSEEK_API_KEY)"/u.test(serviceConfig)) fail("B4B service configuration is not isolated or contains a secret.");
  if (secretEnvironmentNames.some((name) => process.env[name])) fail("B4B E2E process inherited a credential secret.");
  if (await fileExists(bundlePath)) fail("B4B credential output already exists.");
  const expectedDsh = JSON.parse(await readFile(path.join(candidateRoot, "agent-integration", "dsh", "version.json"), "utf8"));
  const validatorUrl = pathToFileURL(path.join(b4bRoot, "source-root", "agent-integration", "scripts", "dsh-source-validator.mjs")).href;
  const { validateDshRuntimeSource, validateDshSource } = await import(validatorUrl);
  const approvedGitDirectory = path.join(b4bRoot, "tools", "mingit-2.55.0.5", "cmd");
  process.env.PATH = approvedGitDirectory + path.delimiter + (process.env.PATH || "");
  const gitVersion = run("git", ["--version"]);
  const gitVersionMatch = /git version (\d+)\.(\d+)/u.exec(gitVersion);
  if (!gitVersionMatch || Number(gitVersionMatch[1]) < 2 || (Number(gitVersionMatch[1]) === 2 && Number(gitVersionMatch[2]) < 26)) fail("approved staged Git version is unavailable or too old.");
  sourceIdentity = await validateDshSource(sourceRoot, expectedDsh, { readOnly: true });
  const runtimeIdentity = await validateDshRuntimeSource(sourceRoot, runtimeRoot);
  if (sourceIdentity.commit !== expectedDsh.sourceCommit || await fileExists(path.join(runtimeRoot, ".git"))) fail("B4B DSH source/runtime identity is invalid.");
  await progress("PRECHECK_DSH_IDENTITY");
  let state = windowsState();
  if (state.formalServiceExists) fail("Formal UEDAssetHub service exists; B4B will not proceed.");
  assertNoHost(state);
  assertPortsAndPipesClear(state);
  if (state.serviceExists) assertServiceIdentity(state);
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "MATERIALIZE");
  await progress("MATERIALIZE");
  if (!state.serviceExists) {
    run(winSwPath, ["install"]);
    serviceInstalled = true;
    state = await waitForServiceState("Stopped");
  } else serviceInstalled = true;
  if (!state.serviceExists || state.serviceState !== "Stopped") fail("B4B service install did not remain Stopped; automatic Host start is prohibited.");
  assertNoHost(state);
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "INSTALL_IDENTITY", { serviceInstalled: true, serviceRunning: false, hostStarted: false });
  await progress("INSTALL_IDENTITY");
  assertServiceIdentity(state);
  run("sc.exe", ["sidtype", serviceName, "unrestricted"]);
  const sidTypeReadback = run("sc.exe", ["qsidtype", serviceName]);
  if (!/UNRESTRICTED/iu.test(sidTypeReadback)) fail("B4B Service SID type readback failed.");
  lifecycleIdentity = await resolveInstalledB4bServiceSid({ lifecycle: lifecycleHolder.state, platform: "win32" });
  serviceSid = lifecycleIdentity.serviceSid;
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "SID_READY", { serviceContext: lifecycleIdentity });
  await progress("SID_READY");
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "CREDENTIAL_PROVISION");
  provisioned = await provisionCredentialBundle({
    lifecycle: lifecycleHolder.state,
    candidateRoot,
    candidateDigest: expectedCandidateDigest,
    b4bRoot,
    applyAcl: applyCredentialAcl,
    validateAcl: validateCredentialAcl
  });
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "ACL_READY");
  await progress("CREDENTIAL_PROVISION");
  state = windowsState();
  assertServiceIdentity(state);
  assertNoHost(state);
  const prestartGate = {
    passed: true,
    serviceInstalled: state.serviceExists,
    serviceRunning: false,
    sidResolution: lifecycleIdentity.accountName === "NT SERVICE\\" + serviceName,
    sidType: lifecycleIdentity.sidType,
    schema: provisioned.evidence.schemaVersion === 1,
    optionalProviderAbsent: provisioned.evidence.providerCredentialPresent === false,
    requiredSecretsPresent: provisioned.evidence.requiredFieldsSatisfied === true,
    dpapiHelperIdentity: provisioned.evidence.dpapiHelperSha256 === deployment.components?.windowsDpapiHelper?.sha256,
    dpapiProtect: true,
    dpapiValidation: provisioned.evidence.validationPassed,
    isolatedPath: provisioned.evidence.protectedBundleRelativePath === "credentials/" + serviceName + ".credentials.dpapi",
    aclApply: provisioned.evidence.aclValidated,
    aclReadback: provisioned.evidence.aclValidated,
    ownershipRecordPersisted: provisioned.evidence.ownershipRecordPersisted === true,
    ownershipRecordIdentity: /^[a-f0-9]{64}$/u.test(provisioned.evidence.ownershipRecordSha256 || ""),
    plaintextResidual: provisioned.evidence.plaintextResidual,
    secretLeak: provisioned.evidence.secretLeak,
    formalCredentialAccessed: provisioned.evidence.formalCredentialAccessed
  };
  if (!isB4bPrestartCredentialGatePassed(prestartGate)) fail("B4B pre-start credential gate did not pass.");
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "PRESTART_READY", { credentialGatePassed: true, gate: prestartGate });
  await progress("PRESTART_CREDENTIAL_GATE");
  const hostBeforeStart = windowsState();
  assertServiceIdentity(hostBeforeStart);
  assertNoHost(hostBeforeStart);
  if (hostBeforeStart.pipeNames.length !== 0 || hostBeforeStart.listeningPorts.length !== 0) fail("B4B pre-start residual gate failed.");
  const hostStartedBeforeGate = false;
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "START");
  startAttempted = true;
  run(winSwPath, ["start"], 60_000);
  await progress("START_REQUESTED");
  const running = await waitFor("SCM RUNNING and one Host process", async () => {
    const current = windowsState();
    if (!current.serviceExists || current.serviceState !== "Running" || current.hostProcessIds.length !== 1) throw new Error("B4B Host startup pending.");
    hostEverObserved = true;
    return current;
  });
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "RUNNING", { serviceRunning: true });
  const hostPid = running.hostProcessIds[0];
  await progress("SCM_RUNNING");
  const base = "http://127.0.0.1:3027";
  const unauthenticated = await waitFor("Asset Hub public edge", async () => {
    const response = await fetch(base + "/api/auth/session", { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error("Asset Hub public edge pending.");
    const body = await response.json();
    if (body?.authenticated !== false) throw new Error("Unauthenticated session contract failed.");
    return body;
  });
  const credentialHelper = path.join(candidateRoot, "native", "windows-dpapi-credential-helper", "bin", "ued-windows-dpapi-credential-helper.exe");
  loadedCredentials = await loadWindowsCredentialBundle({ helperPath: credentialHelper, bundlePath });
  const loginResponse = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: loadedCredentials.ADMIN_PASSWORD }), signal: AbortSignal.timeout(10_000) });
  const loginText = await loginResponse.text();
  if (!loginResponse.ok || secretEnvironmentNames.some((name) => loadedCredentials[name] && loginText.includes(loadedCredentials[name]))) fail("B4B admin login response validation failed.");
  const setCookies = loginResponse.headers.getSetCookie?.() ?? [loginResponse.headers.get("set-cookie") ?? ""];
  const setCookie = setCookies.find((value) => value.startsWith("ued_admin_session=")) || "";
  const cookie = setCookie.split(";", 1)[0];
  if (!cookie) fail("B4B admin login did not establish a session.");
  const statusResponse = await fetch(base + "/api/runtime/status", { headers: { Cookie: cookie }, signal: AbortSignal.timeout(10_000) });
  const runtimeStatus = await statusResponse.json();
  if (!statusResponse.ok || runtimeStatus?.runtime?.shell !== "ready" || runtimeStatus?.runtime?.status !== "configuration_required" || runtimeStatus?.runtime?.reasonCode !== "credential_missing") fail("B4B runtime status is not configuration_required/credential_missing.");
  const readinessUrl = await import(pathToFileURL(path.join(candidateRoot, "agent-integration", "scripts", "runtime-readiness.mjs")).href);
  const dshSession = await readinessUrl.probeDshSessionList({ baseUrl: "http://127.0.0.1:3080" });
  const gateway = await readinessUrl.probeKnowledgeGatewayMcp({ endpoint: "http://127.0.0.1:3082/mcp" });
  const proxyResponse = await fetch("http://127.0.0.1:3081/healthz", { signal: AbortSignal.timeout(5_000) });
  if (!proxyResponse.ok || !Array.isArray(gateway.tools) || !["get_knowledge_asset", "search_knowledge", "search_micro_specs"].every((tool) => gateway.tools.includes(tool))) fail("B4B Gateway, DSH, or Proxy functional verification failed.");
  if (await inspectB4bSecretLeak({ b4bRoot, secrets: Object.values(loadedCredentials) })) fail("B4B secret leak scan failed after startup.");
  const sameInstance = windowsState();
  if (sameInstance.hostProcessIds.length !== 1 || sameInstance.hostProcessIds[0] !== hostPid || sameInstance.formalServiceExists) fail("B4B functional checks did not remain on the same isolated Host instance.");
  await progress("SAME_INSTANCE_FUNCTIONAL_PASS");
  for (const name of Object.keys(loadedCredentials)) loadedCredentials[name] = "";
  loadedCredentials = null;
  stopRequestTime = new Date().toISOString();
  stopRequestAttempted = true;
  await progress("SCM_STOP_REQUESTED", "PASS", { stopRequestTime });
  run(winSwPath, ["stop"], 110_000);
  const stopped = await waitForServiceState("Stopped", 110_000);
  if (stopped.hostProcessIds.length !== 0 || stopped.ownedChildProcessIds.length !== 0) fail("B4B controlled stop did not converge.");
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "STOPPED", { serviceRunning: false, hostProcessCount: 0, ownedChildProcessCount: 0, b4bPipeCount: stopped.pipeNames.length });
  controlledStopCompleted = true;
  await progress("SCM_STOPPED");
  const lifecycleFile = path.join(b4bRoot, "agent-runtime", "logs", "runtime-supervisor.ndjson");
  const lines = (await readFile(lifecycleFile, "utf8")).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
  postStopNewGenerationCount = lines.filter((item) => item.component === "assetHub" && item.status === "started" && typeof item.timestamp === "string" && Date.parse(item.timestamp) >= Date.parse(stopRequestTime)).length;
  await progress("POST_STOP_GENERATIONS_CHECKED", postStopNewGenerationCount === 0 ? "PASS" : "FAIL", { postStopNewGenerationCount });
  if (postStopNewGenerationCount !== 0) fail("Unexpected Asset Hub generation started after the controlled stop request.");
  const stopClientStderrRef = path.join(b4bRoot, "logs", "winsw", serviceName + ".err.log");
  const stopClientLog = await readFile(stopClientStderrRef, "utf8");
  const stopClientMarkers = [...stopClientLog.matchAll(/\[Managed Shutdown Client\] phase=([a-z0-9-]+) status=exited exitCode=(\d+)/gu)];
  if (!stopClientMarkers.length) fail("Managed shutdown client exit-code evidence is missing from the isolated WinSW stderr log.");
  const stopClientPhase = stopClientMarkers.at(-1)[1];
  stopClientExitCode = Number(stopClientMarkers.at(-1)[2]);
  await progress("STOP_CLIENT_EXIT_CODE", stopClientExitCode === 0 ? "PASS" : "FAIL", { stopClientPhase, stopClientExitCode, stopClientStderrRef });
  if (stopClientExitCode !== 0) fail("Managed shutdown client did not exit successfully.");
  const shutdownChecks = {
    stopDiscoveryAccepted: lines.some((item) => item.operation === "discover-shutdown" && item.status === "accepted" && item.phase === "stop-discovery"),
    serviceSidBoundRuntimeControlAccepted: lines.some((item) => item.operation === "shutdown" && item.status === "accepted"),
    managedShutdownEntered: lines.some((item) => item.status === "managed-shutdown-entered"),
    managedComponentsConverged: lines.some((item) => item.status === "managed-components-converged"),
    finalizationCompleted: lines.some((item) => item.status === "finalization-completed")
  };
  if (Object.values(shutdownChecks).some((value) => value !== true)) fail("B4B controlled shutdown evidence is incomplete.");
  await progress("SHUTDOWN_EVIDENCE_PASS");
  await uninstallAndClean();
  const residuals = windowsState();
  if (residuals.serviceExists || residuals.hostProcessIds.length !== 0 || residuals.ownedChildProcessIds.length !== 0 || residuals.pipeNames.length !== 0 || residuals.listeningPorts.length !== 0 || residuals.formalServiceExists || await fileExists(bundlePath) || await fileExists(credentialDirectory)) fail("B4B final residual verification failed.");
  lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "RESIDUALS_CLEAR", { serviceExists: false, hostProcessCount: 0, ownedChildProcessCount: 0, b4bPipeCount: 0, formalMutation: false, formalCredentialAccessed: false, forcedTermination: false });
  await progress("RESIDUALS_CLEAR");
  finalReport = {
    result: "PASS",
    b4bRunId: runId,
    candidateDigest: expectedCandidateDigest,
    dshSource: { commit: sourceIdentity.commit, tree: sourceIdentity.tree, fingerprint: sourceIdentity.fingerprint, gitVersion },
    dshRuntime: { trackedSourceFileCount: runtimeIdentity.trackedSourceFileCount, buildArtifactSha256: JSON.parse(await readFile(path.join(runtimeRoot, ".dsh-build", "client-build-environment.json"), "utf8")).artifacts.sha256 },
    service: { name: serviceName, install: "PASS", autoStarted: false, startMode: "Manual", sidType: lifecycleIdentity.sidType, sidResolution: "PASS", serviceSid },
    prestart: { gate: "PASS", hostStartedBeforeGate: hostStartedBeforeGate, schema: prestartGate.schema, optionalProviderAbsent: prestartGate.optionalProviderAbsent, dpapiHelperIdentity: prestartGate.dpapiHelperIdentity, protect: prestartGate.dpapiProtect, aclApply: prestartGate.aclApply, aclReadback: prestartGate.aclReadback, ownershipRecordPersisted: prestartGate.ownershipRecordPersisted, ownershipRecordIdentity: prestartGate.ownershipRecordIdentity, validation: prestartGate.dpapiValidation, plaintextResidual: false, secretLeak: false, formalCredentialAccessed: false },
    runtime: { scmRunning: "PASS", hostPid, assetHubAuthenticated: true, runtimeStatus: "configuration_required/credential_missing", dshSessionList: "PASS", gatewayMcpTools: gateway.tools, agentProxyHealth: "PASS", sameHostInstance: true },
    shutdown: shutdownChecks,
    observabilityPrestartGate,
    controlledStop: { stopRequestTime, stopClientPhase, stopClientExitCode, stopClientStderrRef, postStopNewGenerationCount },
    cleanup: { stopped: true, serviceUninstalled: true, protectedBundleRemoved: true, credentialDirectoryRemoved: true, residualsClear: true, forcedTermination: false, formalMutation: false }
  };
  await writeFile(evidencePath, JSON.stringify(finalReport, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  await progress("COMPLETE");
  console.log(JSON.stringify({ result: finalReport.result, evidencePath, serviceName, serviceSid, hostPid, dshCommit: sourceIdentity.commit }));
} catch (error) {
  const message = error instanceof Error ? error.message : "B4B service E2E failed.";
  try {
    const state = windowsState();
    if (serviceInstalled && !hostEverObserved && !startAttempted && state.serviceState !== "Running" && state.hostProcessIds.length === 0) await cleanupAfterPrestartFailure();
    else if (serviceInstalled && startAttempted && hostEverObserved && !controlledStopCompleted && !stopRequestAttempted && state.serviceState === "Running") {
      run(winSwPath, ["stop"], 110_000);
      const stopped = await waitForServiceState("Stopped", 110_000);
      if (stopped.hostProcessIds.length !== 0 || stopped.ownedChildProcessIds.length !== 0) fail("controlled shutdown cleanup did not converge.");
      lifecycleHolder.state = transitionB4bServiceLifecycle(lifecycleHolder.state, "STOPPED", { serviceRunning: false, hostProcessCount: 0, ownedChildProcessCount: 0, b4bPipeCount: stopped.pipeNames.length });
      controlledStopCompleted = true;
      await uninstallAndClean();
    } else if (serviceInstalled && startAttempted && hostEverObserved && stopRequestAttempted && !controlledStopCompleted && state.serviceState === "Running") {
      fail("Safety Red Line: the one authorized controlled stop is still pending; service, processes, and credential were preserved without retry.");
    } else if (serviceInstalled && startAttempted && !hostEverObserved) {
      fail("Safety Red Line: start was requested but Host non-start cannot be proven; service and protected bundle were preserved.");
    } else if (serviceInstalled && startAttempted && hostEverObserved && !controlledStopCompleted) {
      fail("Safety Red Line: Host started but controlled SCM shutdown is not available; service and protected bundle were preserved.");
    } else if (serviceInstalled && controlledStopCompleted && state.serviceState === "Stopped") {
      await uninstallAndClean();
    }
  } catch (cleanupError) {
    console.error(cleanupError instanceof Error ? cleanupError.message : "B4B cleanup failed.");
  }
  try { await progress("FAILED_" + stage, "FAIL"); } catch {}
  console.error("B4B service E2E failed at " + stage + ": " + message);
  process.exitCode = 1;
}
