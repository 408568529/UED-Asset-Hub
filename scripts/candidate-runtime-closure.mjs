import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { assertHostRuntimeClosureBinding } from "./release-runtime-closure-contract.mjs";
import { assertCandidateRuntimeClosureManifest } from "./candidate-runtime-closure-manifest.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const inside = (root, target) => { const relative = path.relative(root, target); return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)); };

function fail(message) { throw new Error(`Candidate Host runtime closure gate failed: ${message}`); }

export const requiredCandidateRuntimeFiles = Object.freeze([
  "server.js",
  "scripts/windows-graceful-bootstrap.mjs",
  "scripts/windows-managed-shutdown-client.mjs",
  "scripts/windows-stop-discovery.mjs",
  "scripts/windows-service-identity.mjs",
  "scripts/windows-credential-schema.mjs",
  "scripts/runtime-control-bridge.mjs",
  "scripts/runtime-control-transport.mjs"
]);

export async function verifyRequiredCandidateRuntimeFiles({ sourceRoot = null, candidateRoot }) {
  const candidate = await realpath(path.resolve(candidateRoot));
  const source = sourceRoot ? await realpath(path.resolve(sourceRoot)) : null;
  for (const relative of requiredCandidateRuntimeFiles) {
    const file = path.resolve(candidate, ...relative.split("/"));
    if (!inside(candidate, file)) fail(`required runtime file escapes Candidate: ${relative}`);
    let details;
    try { details = await lstat(file); } catch (error) { if (error.code === "ENOENT") fail(`required runtime file is missing: ${relative}`); throw error; }
    if (!details.isFile() || details.isSymbolicLink() || details.nlink > 1) fail(`required runtime file identity is invalid: ${relative}`);
    const bytes = await readFile(file);
    if (source && relative !== "server.js") {
      const sourceFile = path.resolve(source, ...relative.split("/"));
      if (!inside(source, sourceFile) || sha256(await readFile(sourceFile)) !== sha256(bytes)) fail(`required runtime file differs from source: ${relative}`);
    }
  }
  return { result: "PASS", requiredFileCount: requiredCandidateRuntimeFiles.length, requiredFiles: [...requiredCandidateRuntimeFiles] };
}

export async function verifyCandidateRuntimeObservability({ candidateRoot }) {
  const candidate = await realpath(path.resolve(candidateRoot));
  const requirements = [
    ["scripts/host-supervisor.mjs", ["generation: event.generation", "stderrRef", "exitCode: event.code", "child_exit_code_nonzero", "managed-shutdown-entered", "managed-components-converged", "finalization-completed", "status: \"initializing\"", "status: \"initialized\""]],
    ["scripts/windows-managed-shutdown-client.mjs", ["phase=${phase} status=failed", "status=exited exitCode=${code}"]],
    ["scripts/windows-stop-discovery.mjs", ["connected-authenticated", "verifyStopClientIdentity"]],
    ["scripts/runtime-control-bridge.mjs", ["operation: \"shutdown\", status: \"accepted\""]]
  ];
  for (const [relative, markers] of requirements) {
    const file = path.resolve(candidate, ...relative.split("/"));
    if (!inside(candidate, file)) fail(`observability source escapes Candidate: ${relative}`);
    let details;
    try { details = await lstat(file); } catch (error) { if (error.code === "ENOENT") fail(`observability source is missing: ${relative}`); throw error; }
    if (!details.isFile() || details.isSymbolicLink() || details.nlink > 1) fail(`observability source identity is invalid: ${relative}`);
    const source = await readFile(file, "utf8");
    for (const marker of markers) if (!source.includes(marker)) fail(`observability marker is missing: ${relative}`);
  }
  return { result: "PASS", childFailure: true, shutdownClientPhaseAndExitCode: true, stopDiscoveryLifecycleAndAuthenticatedConnection: true, runtimeControlAndShutdownLifecycle: true, secretsRecorded: false };
}

export function assertNoCandidateRuntimeFallback(environment = {}) {
  if (typeof environment.NODE_PATH === "string" && environment.NODE_PATH.trim()) fail("NODE_PATH is prohibited");
  if (/(?:^|\s)--(?:require|import|loader)(?:=|\s)/u.test(environment.NODE_OPTIONS || "")) fail("NODE_OPTIONS module-resolution hooks are prohibited");
  for (const key of ["UED_SOURCE_ROOT", "UED_ASSET_HUB_SOURCE_ROOT", "ASSET_HUB_SOURCE_ROOT"]) if (typeof environment[key] === "string" && environment[key].trim()) fail(`${key} source-tree fallback is prohibited`);
}

export async function verifyCandidateHostRuntimePackage({ candidateRoot, environment = process.env }) {
  assertNoCandidateRuntimeFallback(environment);
  const root = await realpath(path.resolve(candidateRoot));
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("Candidate root is not a real directory");
  const manifest = JSON.parse(await readFile(path.join(root, "deployment.manifest.json"), "utf8"));
  const provenance = JSON.parse(await readFile(path.join(root, "release.provenance.json"), "utf8"));
  if (provenance.payloadSchemaVersion !== 3) fail("release payload lacks the three-closure runtime contract");
  const runtimeFiles = await verifyRequiredCandidateRuntimeFiles({ candidateRoot: root });
  const runtimeClosure = provenance.runtimeClosure;
  const closureGate = await assertCandidateRuntimeClosureManifest({ manifest: provenance.candidateRuntimeClosure, candidateRoot: root, artifactSet: manifest.artifactSet, sourceCommit: manifest.assetHub?.commit, sourceArchiveSha256: manifest.assetHub?.sourceArchiveSha256, runtimeArtifacts: { nextOutput: provenance.build?.nextOutputArtifact, nodeModules: { digest: provenance.build?.runtimeDependencyArtifact?.nodeModulesManifestSha256, fileCount: provenance.build?.runtimeDependencyArtifact?.fileCount } } });
  assertHostRuntimeClosureBinding({ runtimeClosure, artifactSet: manifest.artifactSet, sourceCommit: manifest.assetHub?.commit, sourceArchiveSha256: manifest.assetHub?.sourceArchiveSha256 });
  const template = await readFile(path.join(root, "service", "windows", "UEDAssetHub.xml.template"), "utf8");
  const entrypoint = /<startarguments>\{\{UED_ROOT\}\}\\current\\([^<]+)<\/startarguments>/u.exec(template)?.[1]?.replaceAll("\\", "/");
  if (entrypoint !== runtimeClosure.entrypoint) fail("service template entrypoint does not match the Candidate closure");
  for (const module of runtimeClosure.modules) {
    const file = path.resolve(root, ...module.path.split("/"));
    if (!inside(root, file)) fail(`runtime module escapes Candidate: ${module.path}`);
    const detail = await lstat(file);
    if (!detail.isFile() || detail.isSymbolicLink() || detail.nlink > 1 || detail.size !== module.size) fail(`runtime module file identity is invalid: ${module.path}`);
    if (!inside(root, await realpath(file)) || sha256(await readFile(file)) !== module.sha256) fail(`runtime module content identity is invalid: ${module.path}`);
  }
  return { result: "PASS", entrypoint, expectedModuleCount: runtimeClosure.moduleCount, actualModuleCount: runtimeClosure.moduleCount, requiredRuntimeFileCount: runtimeFiles.requiredFileCount, candidateRuntimeClosure: closureGate, missingRuntimeModuleCount: 0, graphDigest: runtimeClosure.graphDigest, sourceTreeFallback: false, nodePathFallback: false, runtimeClosure };
}

export async function smokeCandidateHostRuntimeImport({ candidateRoot, nodeExe, environment = process.env }) {
  const gate = await verifyCandidateHostRuntimePackage({ candidateRoot, environment });
  const root = await realpath(path.resolve(candidateRoot));
  const childEnvironment = { ...environment, NODE_ENV: "production" };
  delete childEnvironment.NODE_PATH;
  delete childEnvironment.NODE_OPTIONS;
  delete childEnvironment.UED_SOURCE_ROOT;
  delete childEnvironment.UED_ASSET_HUB_SOURCE_ROOT;
  delete childEnvironment.ASSET_HUB_SOURCE_ROOT;
  const entrypointPath = path.resolve(root, ...gate.entrypoint.split("/"));
  const importProgram = `import { pathToFileURL } from "node:url";\nimport path from "node:path";\nconst candidateRoot = process.cwd();\nawait import(pathToFileURL(path.resolve(candidateRoot, ${JSON.stringify(gate.entrypoint)})).href);\nconsole.log(JSON.stringify({ result: "PASS", entrypointImported: true, hostStarted: false, candidateRoot }));`;
  const run = spawnSync(nodeExe, ["--input-type=module", "-e", importProgram], { cwd: root, env: childEnvironment, encoding: "utf8", windowsHide: true, shell: false, timeout: 45_000 });
  if (run.error || run.status !== 0) fail(`Candidate entrypoint import smoke failed: ${(run.stderr || "").slice(-1200)}`);
  const outputLines = String(run.stdout || "").trim().split(/\r?\n/u).filter(Boolean);
  if (outputLines.length !== 1) fail("Candidate import smoke produced unexpected module output");
  const output = outputLines[0];
  let evidence;
  try { evidence = JSON.parse(output); } catch { fail("Candidate import smoke returned invalid evidence"); }
  if (evidence.result !== "PASS" || evidence.entrypointImported !== true || evidence.hostStarted !== false || path.resolve(evidence.candidateRoot).toLowerCase() !== root.toLowerCase() || !inside(root, entrypointPath)) fail("Candidate import smoke did not remain inside its runtime root");
  return { ...gate, importSmoke: "PASS", hostStarted: false, sourceTreeFallback: false, nodePathFallback: false };
}
