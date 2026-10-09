import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, lstat, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { calculateReleaseArtifactSet } from "./release-artifact-tree.mjs";
import { requiredCandidateRuntimeFiles, verifyCandidateHostRuntimePackage, verifyRequiredCandidateRuntimeFiles, smokeCandidateHostRuntimeImport } from "./candidate-runtime-closure.mjs";
import { deriveHostRuntimeModuleClosure, verifyCandidateHostRuntimeClosure } from "./host-runtime-module-closure.mjs";
import { createHostRuntimeClosureBinding } from "./release-runtime-closure-contract.mjs";
import { createCandidateRuntimeClosureManifest } from "./candidate-runtime-closure-manifest.mjs";
import { canonicalJson } from "./release-artifact-tree.mjs";
import { assertHostRuntimeResolutionEnvironment } from "./start-host.mjs";

const temporary = await mkdtemp(path.join(os.tmpdir(), "ued-host-runtime-closure-"));
const sourceRoot = path.join(temporary, "source"), candidateRoot = path.join(temporary, "candidate");
const sourceCommit = "1".repeat(40), sourceArchiveSha256 = "a".repeat(64);
const fixture = {
  "service/windows/UEDAssetHub.xml.template": '<service><startarguments>{{UED_ROOT}}\\current\\scripts\\start-host.mjs</startarguments></service>\n',
  "scripts/start-host.mjs": 'import "./host-supervisor.mjs";\n',
  "scripts/host-supervisor.mjs": 'import "./windows-service-identity.mjs";\nimport "./windows-credential-schema.mjs";\n',
  "scripts/windows-service-identity.mjs": 'import "./runtime-leaf.mjs";\n',
  "scripts/windows-credential-schema.mjs": "export const schemaVersion = 1;\n",
  "scripts/windows-graceful-bootstrap.mjs": 'import "./runtime-leaf.mjs";\n',
  "scripts/windows-managed-shutdown-client.mjs": 'import "./runtime-leaf.mjs";\n',
  "scripts/windows-stop-discovery.mjs": "export const stopDiscovery = true;\n",
  "scripts/runtime-control-bridge.mjs": "export const runtimeControl = true;\n",
  "scripts/runtime-control-transport.mjs": "export const runtimeTransport = true;\n",
  "scripts/runtime-leaf.mjs": "export const runtimeLeaf = true;\n"
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
async function makeSource() {
  for (const [relative, content] of Object.entries(fixture)) { const file = path.join(sourceRoot, ...relative.split("/")); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, content); }
  await writeFile(path.join(sourceRoot, "server.js"), "// generated standalone server\n");
  await mkdir(path.join(sourceRoot, ".next", "server"), { recursive: true }); await writeFile(path.join(sourceRoot, ".next", "server", "entry.js"), "export default true;\n");
  await mkdir(path.join(sourceRoot, ".next", "static"), { recursive: true }); await writeFile(path.join(sourceRoot, ".next", "static", "chunk.js"), "globalThis.__fixture=true;\n");
  await mkdir(path.join(sourceRoot, "node_modules", "fixture-package"), { recursive: true }); await writeFile(path.join(sourceRoot, "node_modules", "fixture-package", "index.js"), "module.exports=true;\n");
}
async function resetCandidate() { await rm(candidateRoot, { recursive: true, force: true }); await cp(sourceRoot, candidateRoot, { recursive: true }); }
async function treeManifest(directory, prefix = "") { const files = []; async function visit(current, relative) { for (const entry of await readdir(current, { withFileTypes: true })) { const child = relative ? `${relative}/${entry.name}` : entry.name, file = path.join(current, entry.name), detail = await lstat(file); if (detail.isDirectory()) await visit(file, child); else { const bytes = await readFile(file); files.push({ path: prefix ? `${prefix}/${child}` : child, sha256: hash(bytes), size: bytes.length }); } } } await visit(directory, ""); files.sort((a,b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path))); return { files, digest: hash(Buffer.from(canonicalJson(files), "utf8")) }; }
async function verifyComplete() {
  const closure = await deriveHostRuntimeModuleClosure(sourceRoot);
  const binding = createHostRuntimeClosureBinding({ ...closure, sourceCommit, sourceArchiveSha256 });
  const artifactSet = await calculateReleaseArtifactSet(candidateRoot);
  const result = await verifyCandidateHostRuntimeClosure({ sourceRoot, candidateRoot, runtimeClosure: binding, artifactSet, sourceCommit, sourceArchiveSha256, environment: {} });
  assert.equal(result.result, "PASS");
  assert.equal(result.expectedModuleCount, 5);
  assert.equal(result.actualModuleCount, 5);
  assert.equal(result.missingModulePaths.length, 0);
  assert.equal(result.sourceTreeFallback, false);
  assert.equal(result.nodePathFallback, false);
  const required = await verifyRequiredCandidateRuntimeFiles({ sourceRoot, candidateRoot });
  assert.equal(required.requiredFileCount, requiredCandidateRuntimeFiles.length);
  return binding;
}

try {
  await makeSource();
  await resetCandidate();
  const binding = await verifyComplete();
  for (const relative of ["scripts/windows-service-identity.mjs", "scripts/windows-credential-schema.mjs", "scripts/runtime-leaf.mjs"]) {
    await resetCandidate();
    await rm(path.join(candidateRoot, ...relative.split("/")));
    await assert.rejects(() => verifyCandidateHostRuntimeClosure({ sourceRoot, candidateRoot, runtimeClosure: binding, sourceCommit, sourceArchiveSha256, environment: {} }), /Candidate closure mismatch/u);
  }
  for (const relative of requiredCandidateRuntimeFiles) {
    await resetCandidate();
    await rm(path.join(candidateRoot, ...relative.split("/")));
    await assert.rejects(() => verifyRequiredCandidateRuntimeFiles({ sourceRoot, candidateRoot }), /required runtime file is missing/u);
  }
  await resetCandidate();
  await writeFile(path.join(candidateRoot, "scripts/runtime-leaf.mjs"), "export const runtimeLeaf = false;\n");
  await assert.rejects(() => verifyCandidateHostRuntimeClosure({ sourceRoot, candidateRoot, runtimeClosure: binding, sourceCommit, sourceArchiveSha256, environment: {} }), /content=/u);
  await resetCandidate();
  await writeFile(path.join(candidateRoot, "scripts/start-host.mjs"), 'import "../../outside.mjs";\n');
  await assert.rejects(() => verifyCandidateHostRuntimeClosure({ sourceRoot, candidateRoot, runtimeClosure: binding, sourceCommit, sourceArchiveSha256, environment: {} }), /escapes Candidate root/u);
  await resetCandidate();
  await rm(path.join(candidateRoot, "scripts/windows-service-identity.mjs"));
  await assert.rejects(() => verifyCandidateHostRuntimeClosure({ sourceRoot, candidateRoot, runtimeClosure: binding, sourceCommit, sourceArchiveSha256, environment: {} }), /missing=/u);
  await resetCandidate();
  await assert.rejects(() => verifyCandidateHostRuntimeClosure({ sourceRoot, candidateRoot, runtimeClosure: binding, sourceCommit, sourceArchiveSha256, environment: { NODE_PATH: sourceRoot } }), /NODE_PATH/u);
  await assert.rejects(() => verifyCandidateHostRuntimeClosure({ sourceRoot, candidateRoot, runtimeClosure: binding, sourceCommit, sourceArchiveSha256, environment: { NODE_OPTIONS: `--require=${path.join(sourceRoot, "fallback.cjs")}` } }), /NODE_OPTIONS/u);
  assert.throws(() => assertHostRuntimeResolutionEnvironment({ NODE_PATH: sourceRoot }), /NODE_PATH/u);
  assert.throws(() => assertHostRuntimeResolutionEnvironment({ UED_SOURCE_ROOT: sourceRoot }), /source-tree fallback/u);

  const smokeRoot = path.join(temporary, "smoke-candidate");
  await cp(candidateRoot, smokeRoot, { recursive: true });
  const smokeClosure = await deriveHostRuntimeModuleClosure(smokeRoot);
  const smokeBinding = createHostRuntimeClosureBinding({ ...smokeClosure, sourceCommit, sourceArchiveSha256 });
  const smokeArtifacts = await calculateReleaseArtifactSet(smokeRoot);
  const candidateRuntimeClosure = await createCandidateRuntimeClosureManifest({ sourceRoot, candidateRoot: smokeRoot, sourceCommit, sourceArchiveSha256, buildId: "fixture-build", nextOutput: await treeManifest(path.join(smokeRoot, ".next"), ".next"), nodeModules: await treeManifest(path.join(smokeRoot, "node_modules")) });
  await writeFile(path.join(smokeRoot, "deployment.manifest.json"), JSON.stringify({ assetHub: { commit: sourceCommit, sourceArchiveSha256 }, artifactSet: smokeArtifacts }));
  await writeFile(path.join(smokeRoot, "release.provenance.json"), JSON.stringify({ payloadSchemaVersion: 3, runtimeClosure: smokeBinding, candidateRuntimeClosure, build: { nextOutputArtifact: candidateRuntimeClosure.closures.assetHubChild.runtimeArtifacts.nextOutput, runtimeDependencyArtifact: { nodeModulesManifestSha256: candidateRuntimeClosure.closures.assetHubChild.runtimeArtifacts.nodeModules.digest, fileCount: candidateRuntimeClosure.closures.assetHubChild.runtimeArtifacts.nodeModules.fileCount } } }));
  const smoke = await smokeCandidateHostRuntimeImport({ candidateRoot: smokeRoot, nodeExe: process.execPath, environment: {} });
  assert.equal(smoke.importSmoke, "PASS");
  assert.equal(smoke.hostStarted, false);
  assert.equal(smoke.sourceTreeFallback, false);
  assert.equal(smoke.nodePathFallback, false);
  assert.equal(await readFile(path.join(smokeRoot, "scripts/start-host.mjs"), "utf8"), fixture["scripts/start-host.mjs"]);

  console.log(JSON.stringify({ result: "PASS", expectedHostRuntimeModuleCount: binding.moduleCount, requiredRuntimeFileCount: requiredCandidateRuntimeFiles.length, missingRuntimeFileTests: requiredCandidateRuntimeFiles.length, missingModuleTests: 3, wrongContentSha: "FAIL_CLOSED", outsideCandidate: "FAIL_CLOSED", sourceTreeFallback: "FAIL_CLOSED", nodePathFallback: "FAIL_CLOSED", candidateImportSmoke: "PASS", hostStarted: false }));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
