import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { calculateReleaseArtifactSet, canonicalJson } from "./release-artifact-tree.mjs";
import { assertNoCandidateRuntimeFallback } from "./candidate-runtime-closure.mjs";
import { assertCandidateRuntimeClosureManifest, createCandidateRuntimeClosureManifest } from "./candidate-runtime-closure-manifest.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-three-runtime-closures-")), source = path.join(root, "source"), candidate = path.join(root, "candidate");
const commit = "1".repeat(40), archiveSha = "a".repeat(64), buildId = "build-fixture";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sourceFiles = {
  "service/windows/UEDAssetHub.xml.template": '<service><startarguments>{{UED_ROOT}}\\current\\scripts\\start-host.mjs</startarguments></service>\n',
  "scripts/start-host.mjs": 'import "./host-supervisor.mjs";\n',
  "scripts/host-supervisor.mjs": 'import "./windows-service-identity.mjs";\nimport "./windows-credential-schema.mjs";\n',
  "scripts/windows-service-identity.mjs": 'import "./runtime-leaf.mjs";\n',
  "scripts/windows-credential-schema.mjs": "export const schemaVersion = 1;\n",
  "scripts/windows-graceful-bootstrap.mjs": 'import "./windows-graceful-pipe.mjs";\n',
  "scripts/windows-graceful-pipe.mjs": 'import "./runtime-control-transport.mjs";\n',
  "scripts/windows-managed-shutdown-client.mjs": 'import "./windows-stop-discovery.mjs";\nimport "./runtime-control-bridge.mjs";\nimport "./windows-service-identity.mjs";\n',
  "scripts/windows-stop-discovery.mjs": 'import "./runtime-control-transport.mjs";\n',
  "scripts/runtime-control-bridge.mjs": 'import "./runtime-control-transport.mjs";\n',
  "scripts/runtime-control-transport.mjs": "export const transport = true;\n",
  "scripts/runtime-leaf.mjs": "export const leaf = true;\n"
};
async function seed(directory) {
  for (const [relative, bytes] of Object.entries(sourceFiles)) { const file = path.join(directory, ...relative.split("/")); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); }
  await writeFile(path.join(directory, "server.js"), "// generated Next standalone server\n");
  await mkdir(path.join(directory, ".next", "server"), { recursive: true }); await writeFile(path.join(directory, ".next", "server", "entry.js"), "export default true;\n");
  await mkdir(path.join(directory, ".next", "static"), { recursive: true }); await writeFile(path.join(directory, ".next", "static", "chunk.js"), "globalThis.__fixture = true;\n");
  await mkdir(path.join(directory, "node_modules", "fixture-package"), { recursive: true }); await writeFile(path.join(directory, "node_modules", "fixture-package", "index.js"), "module.exports = true;\n");
}
async function tree(directory, prefix = "") {
  const files = [];
  async function walk(current, relative) { const { readdir, lstat, readFile } = await import("node:fs/promises"); for (const entry of await readdir(current, { withFileTypes: true })) { const next = relative ? `${relative}/${entry.name}` : entry.name, file = path.join(current, entry.name), detail = await lstat(file); if (detail.isDirectory()) await walk(file, next); else files.push({ path: prefix ? `${prefix}/${next}` : next, sha256: sha256(await readFile(file)), size: detail.size }); } }
  await walk(directory, ""); files.sort((a,b) => a.path.localeCompare(b.path)); return { files, digest: sha256(Buffer.from(canonicalJson(files), "utf8")) };
}
async function manifestFor(current = candidate) {
  const nextOutput = await tree(path.join(current, ".next"), ".next"), nodeModules = await tree(path.join(current, "node_modules"));
  return createCandidateRuntimeClosureManifest({ sourceRoot: source, candidateRoot: current, sourceCommit: commit, sourceArchiveSha256: archiveSha, buildId, nextOutput, nodeModules });
}
async function check(current, value, identity = {}) {
  return assertCandidateRuntimeClosureManifest({ manifest: value, candidateRoot: current, artifactSet: await calculateReleaseArtifactSet(current), sourceCommit: identity.sourceCommit ?? commit, sourceArchiveSha256: identity.sourceArchiveSha256 ?? archiveSha, runtimeArtifacts: value.closures.assetHubChild.runtimeArtifacts });
}

try {
  await mkdir(source); await seed(source); await cp(source, candidate, { recursive: true });
  const good = await manifestFor();
  const result = await check(candidate, good);
  assert.equal(result.hostCount, 5); assert.equal(result.childCount, 4); assert.equal(result.shutdownCount, 6); assert.equal(result.unionCount, good.union.memberCount);
  for (const relative of ["scripts/host-supervisor.mjs", "scripts/windows-graceful-bootstrap.mjs", "scripts/windows-graceful-pipe.mjs", "scripts/windows-stop-discovery.mjs", "server.js"]) {
    const trial = path.join(root, `missing-${path.basename(relative)}`); await cp(candidate, trial, { recursive: true }); await rm(path.join(trial, ...relative.split("/")));
    await assert.rejects(() => check(trial, good));
  }
  const wrongBytes = path.join(root, "wrong-bytes"); await cp(candidate, wrongBytes, { recursive: true }); await writeFile(path.join(wrongBytes, "scripts/windows-graceful-bootstrap.mjs"), "// changed bytes\n"); await assert.rejects(() => check(wrongBytes, good));
  const outsideSource = path.join(root, "outside-source"), outsideCandidate = path.join(root, "outside-candidate"); await cp(source, outsideSource, { recursive: true }); await writeFile(path.join(outsideSource, "scripts", "windows-graceful-bootstrap.mjs"), 'import "../../outside.mjs";\n'); await cp(outsideSource, outsideCandidate, { recursive: true }); await assert.rejects(() => manifestFor(outsideCandidate), /escapes root/u);
  await assert.rejects(() => check(candidate, good, { sourceCommit: "2".repeat(40) }));
  const tampered = structuredClone(good); tampered.union.memberCount += 1; await assert.rejects(() => check(candidate, tampered));
  assert.throws(() => assertNoCandidateRuntimeFallback({ NODE_PATH: source }));
  assert.throws(() => assertNoCandidateRuntimeFallback({ UED_SOURCE_ROOT: source }));
  console.log(JSON.stringify({ result: "PASS", hostCount: result.hostCount, childCount: result.childCount, shutdownCount: result.shutdownCount, unionCount: result.unionCount, missingModuleCases: 5, wrongBytes: "FAIL_CLOSED", outsideCandidate: "FAIL_CLOSED", sourceBindingMismatch: "FAIL_CLOSED", manifestTamper: "FAIL_CLOSED", sourceFallback: "FAIL_CLOSED", completeClosures: "PASS" }));
} finally { await rm(root, { recursive: true, force: true }); }
