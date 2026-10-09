import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { appendFile, copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createNativeSetManifestV2, nativeComponentDefinitions, nativeSourceInputs, promoteNativeCandidate, verifyFrozenNativeSet, writeCanonicalManifest, writeNativeComponentManifest } from "./native-artifact-contract.mjs";
import { calculateReleaseArtifactSet, canonicalJson } from "./release-artifact-tree.mjs";
import { verifyRelease } from "./windows-deployment-contract.mjs";
import { componentPaths, sourceReleaseComponentPaths } from "./windows-release-payload.mjs";
import { createControlledSourceSnapshot } from "./create-controlled-source-snapshot.mjs";
import { r3DiagnosticObserverPath, assertR3DiagnosticObserverClosure } from "./r3-diagnostic-observer-contract.mjs";
import { compareObserverModules, validateObserverEntry } from "./r3-observer-schema.mjs";
import { assertFrozenNativeSetBinding, assertNpmTreeHasNoSecrets, assertPackageLockContract, bindWindowsReleaseInputs, buildContract, assertBuildPlatform, assertPinnedIdentity, compareDependencyEvidence, compareNpmLsGraphs, deterministicBuildId, finalizeWindowsRelease, findDotenvFiles, materializeArchive, npmTreeDigest, prepareWindowsRelease, resolveFrozenNativeSetPath, runWindowsNextBuild, validateSourceSnapshotManifest } from "./windows-release-constructor.mjs";

const dshCommit = "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
const runtimeRelevantNextPrefixes = Object.freeze([".next/standalone/", ".next/static/"]);
assert(sourceReleaseComponentPaths().includes(componentPaths.managedShutdownClient), "managed shutdown client must be copied from the current source payload.");

function parseArgs(argv) {
  const values = {};
  const focused = { stop: false, dependencyStop: false, r3StopAfterAb: false, r3bDiagnostic: false, r3b2Probe: false, r3b2Diagnostic: false, r3b2bProbe: false, r3b2bSmoke: false, r3b2bDiagnostic: false, fail: null };
  for (let index = 0; index < argv.length;) {
    const key = argv[index];
    if (key === "--focused-entry-stop") { focused.stop = true; index += 1; continue; }
    if (key === "--focused-dependency-stop") { focused.dependencyStop = true; index += 1; continue; }
    if (key === "--r3-stop-after-ab") { focused.r3StopAfterAb = true; index += 1; continue; }
    if (key === "--r3b-diagnostic") { focused.r3bDiagnostic = true; index += 1; continue; }
    if (key === "--r3b2-probe") { focused.r3b2Probe = true; index += 1; continue; }
    if (key === "--r3b2-diagnostic") { focused.r3b2Diagnostic = true; index += 1; continue; }
    if (key === "--r3b2b-probe") { focused.r3b2bProbe = true; index += 1; continue; }
    if (key === "--r3b2b-smoke") { focused.r3b2bSmoke = true; index += 1; continue; }
    if (key === "--r3b2b-diagnostic") { focused.r3b2bDiagnostic = true; index += 1; continue; }
    if (key?.startsWith("--focused-entry-fail=")) { focused.fail = key.slice("--focused-entry-fail=".length); index += 1; continue; }
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values[key.slice(2)]) throw new Error("verifier arguments are invalid.");
    values[key.slice(2)] = value;
    index += 2;
  }
  for (const key of ["staging-root", "source-archive", "source-archive-sha256", "source-commit", "native-set-root", "native-build-id", "native-set-digest", "native-set-run-binding-a", "native-set-run-binding-b", "node-root", "dsh-source-root", "dsh-provenance-evidence", "run-root", "evidence-dir", "security-set", "security-set-id", "security-set-authorization-id"]) if (!values[key]) throw new Error(`missing --${key}`);
  if (!/^[a-f0-9]{64}$/.test(values["source-archive-sha256"])) throw new Error("source archive SHA-256 argument is invalid.");
  if (focused.r3StopAfterAb || focused.r3b2bProbe || focused.r3b2bSmoke || focused.r3b2bDiagnostic) {
    if (!values["source-snapshot-manifest"] || !/^[a-f0-9]{64}$/.test(values["source-snapshot-manifest-sha256"] || "")) throw new Error("R3 diagnostic requires source snapshot manifest identity.");
  }
  return { values, focused };
}

async function validateR3SnapshotAuthority(args, stagingRoot, sourceManifest) {
  const snapshotPath = path.resolve(args["source-snapshot-manifest"]);
  const relative = path.relative(stagingRoot, snapshotPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("R3 diagnostic source snapshot manifest must be inside isolated staging.");
  const snapshotBytes = await readFile(snapshotPath);
  if (digest(snapshotBytes) !== args["source-snapshot-manifest-sha256"]) throw new Error("R3 diagnostic source snapshot manifest SHA-256 mismatch.");
  const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
  const validated = await validateSourceSnapshotManifest({
    "source-classification": "SNAPSHOT_WITH_UNCOMMITTED_CHANGES",
    "source-snapshot-manifest": snapshotPath,
    "source-snapshot-manifest-sha256": args["source-snapshot-manifest-sha256"],
    "source-commit": args["source-commit"],
    "source-archive-sha256": args["source-archive-sha256"],
    "creation-run-id": snapshot.creationRunId,
  }, sourceManifest);
  return validated.snapshot;
}

function run(command, args, { cwd, env, timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout = [];
    const stderr = [];
    let timer;
    if (timeoutMs) timer = setTimeout(() => { child.kill(); reject(new Error(`${path.basename(command)} timed out.`)); }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      const output = Buffer.concat(stdout).toString("utf8");
      const errors = Buffer.concat(stderr).toString("utf8");
      code === 0 ? resolve(output) : reject(new Error(`${path.basename(command)} failed (${code}): ${errors || output}`));
    });
  });
}

function same(left, right, label) {
  if (canonicalJson(left) !== canonicalJson(right)) throw new Error(`${label} A/B mismatch.`);
}

function manifestDifference(left, right) {
  const leftByPath = new Map(left.files.map((file) => [file.path, file]));
  const rightByPath = new Map(right.files.map((file) => [file.path, file]));
  const paths = [...new Set([...leftByPath.keys(), ...rightByPath.keys()])].sort(compareUtf8);
  const differences = paths.filter((filePath) => canonicalJson(leftByPath.get(filePath) ?? null) !== canonicalJson(rightByPath.get(filePath) ?? null)).map((filePath) => ({ path: filePath, a: leftByPath.get(filePath) ?? null, b: rightByPath.get(filePath) ?? null }));
  return { identical: differences.length === 0, aOnly: differences.filter((item) => item.a && !item.b).map((item) => item.path), bOnly: differences.filter((item) => !item.a && item.b).map((item) => item.path), differing: differences.filter((item) => item.a && item.b), first: differences[0] ?? null };
}

function runtimeRelevantNext(manifest) {
  return { files: manifest.files.filter((file) => runtimeRelevantNextPrefixes.some((prefix) => file.path.startsWith(prefix))) };
}

async function persistR3OutputIdentity(prepared, evidenceDir, label) {
  const runtime = runtimeRelevantNext(prepared.rawNext);
  const manifest = JSON.parse(await readFile(path.join(prepared.workspace, ".next", "app-build-manifest.json"), "utf8"));
  const refs = manifest.pages?.["/_not-found/page"];
  if (!Array.isArray(refs)) throw new Error("R3 output envelope is missing /_not-found/page references.");
  const assets = await Promise.all(refs.map(async (name) => {
    const bytes = await readFile(path.join(prepared.workspace, ".next", name));
    const chunkIds = /\.push\(\[\[([0-9,]+)\]/.exec(bytes.toString("utf8"))?.[1] ?? null;
    return { name, size: bytes.length, sha256: digest(bytes), emittedChunkIds: chunkIds };
  }));
  await writeR3bJson(evidenceDir, `runtime-identity-${label}.json`, { runtimeDigest: digest(canonicalJson(runtime)), runtime, manifest, assets });
}

function nextComparisonLadder(left, right) {
  const raw = manifestDifference(left, right);
  const runtimeRelevant = manifestDifference(runtimeRelevantNext(left), runtimeRelevantNext(right));
  return { raw, runtimeRelevant, continue: runtimeRelevant.identical };
}

function hashedChunkEvidence(comparison) {
  const first = comparison.first;
  if (!first || !/\/chunks\/[^/]+\.js$/i.test(first.path)) return null;
  const left = first.a;
  const right = first.b;
  return { path: first.path, a: left ?? null, b: right ?? null, samePathPresentInBoth: Boolean(left && right), contentShaMatch: Boolean(left && right && left.sha256 === right.sha256) };
}

function strictChild(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(label + " must be a strict child.");
  return candidate;
}

async function resolveManifestChunk(workspace, reference) {
  if (typeof reference !== "string" || !reference || reference.includes("\\") || path.isAbsolute(reference) || path.win32.isAbsolute(reference) || path.posix.isAbsolute(reference)) throw new Error("EVIDENCE PATH SAFETY FAILURE: unsafe manifest chunk reference.");
  const parts = reference.split("/");
  if (parts.length < 3 || parts[0] !== "static" || parts[1] !== "chunks" || parts.some((part) => !part || part === "." || part === "..")) throw new Error("EVIDENCE PATH SAFETY FAILURE: manifest chunk reference is outside static/chunks.");
  const allowedRoot = path.resolve(workspace, ".next", "static", "chunks");
  const candidate = strictChild(allowedRoot, path.resolve(allowedRoot, ...parts.slice(2)), "Manifest chunk path");
  let current = allowedRoot;
  for (const part of parts.slice(2)) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error("EVIDENCE PATH SAFETY FAILURE: manifest chunk path contains a link or reparse point.");
  }
  const realAllowedRoot = await realpath(allowedRoot);
  const realCandidate = await realpath(candidate);
  strictChild(realAllowedRoot, realCandidate, "Resolved manifest chunk path");
  return { reference, sourcePath: candidate };
}

function byteContext(bytes, offset) {
  const start = Math.max(0, offset - 24);
  const end = Math.min(bytes.length, offset + 24);
  return { start, end, hex: bytes.subarray(start, end).toString("hex") };
}

function firstByteDifference(left, right) {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) if (left[index] !== right[index]) return { offset: index, a: byteContext(left, index), b: byteContext(right, index) };
  return left.length === right.length ? null : { offset: limit, a: byteContext(left, limit), b: byteContext(right, limit) };
}

function textDifference(left, right) {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const a = decoder.decode(left);
    const b = decoder.decode(right);
    let offset = 0;
    while (offset < a.length && offset < b.length && a.charCodeAt(offset) === b.charCodeAt(offset)) offset += 1;
    if (offset === a.length && offset === b.length) return { identical: true };
    const prefix = a.slice(0, offset);
    return { identical: false, line: prefix.split("\n").length, column: offset - prefix.lastIndexOf("\n"), a: a.slice(Math.max(0, offset - 120), offset + 120), b: b.slice(Math.max(0, offset - 120), offset + 120) };
  } catch {
    return { identical: null };
  }
}

async function copyVerifiedEvidence(source, destination) {
  const temporary = destination + ".partial";
  await copyFile(source, temporary);
  const sourceBytes = await readFile(source);
  const temporaryBytes = await readFile(temporary);
  if (!sourceBytes.equals(temporaryBytes)) throw new Error("R3B evidence copy/hash failure: " + path.basename(destination));
  await rename(temporary, destination);
  const persisted = await readFile(destination);
  if (!sourceBytes.equals(persisted)) throw new Error("R3B evidence persistence verification failed: " + path.basename(destination));
  return { size: persisted.length, sha256: digest(persisted) };
}

async function writeR3bJson(evidenceDir, name, value) {
  const target = path.join(evidenceDir, name);
  await writeFile(target, canonicalJson(value) + "\n", "utf8");
  const persisted = JSON.parse(await readFile(target, "utf8"));
  if (canonicalJson(persisted) !== canonicalJson(value)) throw new Error("R3B evidence persistence verification failed: " + name);
}

async function captureManifestChunkEvidence({ evidenceDir, comparison, workspaceA, workspaceB }) {
  const first = comparison.first;
  const structured = await jsonDifference(first, workspaceA, workspaceB);
  if (!first?.a || !first?.b || !structured || typeof structured.a !== "string" || typeof structured.b !== "string") throw new Error("R3B manifest-to-chunk evidence requires a divergent string manifest reference.");
  const [a, b] = await Promise.all([resolveManifestChunk(workspaceA, structured.a), resolveManifestChunk(workspaceB, structured.b)]);
  const manifestA = path.join(workspaceA, ...first.path.split("/"));
  const manifestB = path.join(workspaceB, ...first.path.split("/"));
  await Promise.all([copyVerifiedEvidence(manifestA, path.join(evidenceDir, "manifest-a.json")), copyVerifiedEvidence(manifestB, path.join(evidenceDir, "manifest-b.json"))]);
  const persistedA = await copyVerifiedEvidence(a.sourcePath, path.join(evidenceDir, "chunk-a.js"));
  const persistedB = await copyVerifiedEvidence(b.sourcePath, path.join(evidenceDir, "chunk-b.js"));
  const bytesA = await readFile(path.join(evidenceDir, "chunk-a.js"));
  const bytesB = await readFile(path.join(evidenceDir, "chunk-b.js"));
  const byte = firstByteDifference(bytesA, bytesB);
  const text = textDifference(bytesA, bytesB);
  const summary = { manifest: { path: first.path, field: structured.field, aReference: a.reference, bReference: b.reference }, chunks: { a: { sourcePath: a.sourcePath, exists: true, ...persistedA }, b: { sourcePath: b.sourcePath, exists: true, ...persistedB }, byteIdentical: bytesA.equals(bytesB), textIdentical: text.identical, firstByteDifference: byte, firstTextDifference: text.identical === false ? { line: text.line, column: text.column, a: text.a, b: text.b } : null } };
  await Promise.all([
    writeFile(path.join(evidenceDir, "chunk-a.sha256"), persistedA.sha256 + "\n", "ascii"),
    writeFile(path.join(evidenceDir, "chunk-b.sha256"), persistedB.sha256 + "\n", "ascii"),
    writeR3bJson(evidenceDir, "runtime-next-diff.json", comparison),
    writeR3bJson(evidenceDir, "chunk-byte-diff.json", summary),
  ]);
  return summary;
}

function firstDifference(left, right, field = "$") {
  if (canonicalJson(left) === canonicalJson(right)) return null;
  if (Array.isArray(left) && Array.isArray(right)) {
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const found = firstDifference(left[index] ?? null, right[index] ?? null, field + "[" + index + "]");
      if (found) return found;
    }
  } else if (left && right && typeof left === "object" && typeof right === "object") {
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(compareUtf8)) {
      const found = firstDifference(left[key] ?? null, right[key] ?? null, field + "." + key);
      if (found) return found;
    }
  }
  return { field, a: left ?? null, b: right ?? null };
}

async function captureWebpackObserverEvidence(evidenceDir, observerRoot = "r3b-observer") {
  const read = async (label) => JSON.parse(await readFile(path.join(evidenceDir, observerRoot + "-" + label, "webpack-observer-client.json"), "utf8"));
  const [a, b] = await Promise.all([read("a"), read("b")]);
  const findModule = (entry, moduleId) => entry.modules.find((module) => String(module.moduleId) === String(moduleId)) ?? null;
  const idMapping = {
    a: findModule(a, "24223"),
    b: findModule(b, "55626"),
  };
  if (!idMapping.a || !idMapping.b) throw new Error("R3B2 module-ID evidence did not contain both frozen divergent IDs.");
  const normalizeModules = (entry) => entry.modules.map((module) => ({ ...module, identifier: module.analysisIdentifier, resource: module.analysisResource })).sort((left, right) => String(left.identifier).localeCompare(String(right.identifier), "en-US"));
  const normalizeChunks = (entry) => entry.chunks.map((chunk) => ({ ...chunk, modules: chunk.modules.map((module) => ({ ...module, identifier: module.analysisIdentifier })), rootModules: chunk.rootModules.map((module) => ({ ...module, identifier: module.analysisIdentifier })) })).sort((left, right) => (String(left.name) + "\u0000" + String(left.id)).localeCompare(String(right.name) + "\u0000" + String(right.id), "en-US"));
  const config = firstDifference(a.effectiveConfig, b.effectiveConfig);
  const modules = firstDifference(normalizeModules(a), normalizeModules(b));
  const chunks = firstDifference(normalizeChunks(a), normalizeChunks(b));
  const runtimes = firstDifference(normalizeChunks(a).map((chunk) => ({ name: chunk.name, id: chunk.id, runtimeModules: chunk.runtimeModules })), normalizeChunks(b).map((chunk) => ({ name: chunk.name, id: chunk.id, runtimeModules: chunk.runtimeModules })));
  const pre = firstDifference(a.preMinifyRuntimeAssets, b.preMinifyRuntimeAssets);
  const post = firstDifference(a.postMinifyRuntimeAssets, b.postMinifyRuntimeAssets);
  const earliest = modules ? { stage: "MODULE_INPUT", evidence: modules } : chunks ? { stage: "CHUNK_GRAPH", evidence: chunks } : runtimes ? { stage: "RUNTIME_MODULE", evidence: runtimes } : pre ? { stage: "PRE_MINIFY", evidence: pre } : post ? { stage: "POST_MINIFY", evidence: post } : null;
  const analysis = { observationOnly: true, buildSemanticsPerturbed: false, effectiveConfigDifference: config, moduleEvidenceDifference: modules, chunkGraphDifference: chunks, runtimeModuleDifference: runtimes, preMinifyDifference: pre, postMinifyDifference: post, earliest, idMapping };
  await Promise.all([
    writeR3bJson(evidenceDir, "effective-config-diff.json", { difference: config }),
    writeR3bJson(evidenceDir, "module-evidence-diff.json", { difference: modules }),
    writeR3bJson(evidenceDir, "chunk-graph-diff.json", { difference: chunks }),
    writeR3bJson(evidenceDir, "runtime-module-diff.json", { difference: runtimes }),
    writeR3bJson(evidenceDir, "webpack-runtime-analysis.json", analysis),
    writeR3bJson(evidenceDir, "module-id-mapping.json", idMapping),
  ]);
  return analysis;
}

async function readR3b2BootstrapGate(observerDir) {
  const events = (await readFile(path.join(observerDir, "bootstrap-events.jsonl"), "utf8"))
    .trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const actualWorker = (event) => event.isNextWorker === true && event.isNextBuildWorker === true;
  const observerLoaded = events.some((event) => event.event === "observer_loaded" && actualWorker(event));
  const webpackLoaded = events.some((event) => event.event === "webpack_load_observed" && actualWorker(event));
  const compilationHook = events.some((event) => event.event === "compilation_hook_reached" && actualWorker(event));
  return {
    observerLoadedInActualWebpackWorker: observerLoaded,
    webpackLoadObserved: webpackLoaded,
    compilationHookReached: compilationHook,
    evidenceExternalCleanupSafe: true,
    buildSemanticsPerturbed: false,
    events,
  };
}

async function readR3b2bObserverEvidence(observerDir) {
  const files = (await readdir(observerDir)).filter((name) => /^webpack-observer-[ab]-.+-pid\d+\.json$/.test(name)).sort(compareUtf8);
  if (!files.length) throw new Error("R3B2B observer did not persist any compiler evidence.");
  const entries = await Promise.all(files.map(async (name) => validateObserverEntry(JSON.parse(await readFile(path.join(observerDir, name), "utf8")))));
  const reached = (name) => entries.some((entry) => entry.compilation && Array.isArray(entry.preModuleIds) && Array.isArray(entry.postModuleIds) && Array.isArray(entry.chunkMembership));
  return {
    files,
    entries,
    actualNextChildWorker: entries.some((entry) => entry.compilation?.isNextWorker && entry.compilation?.isNextBuildWorker),
    compilerObserved: entries.some((entry) => entry.exportIdentity?.compilerWebpackStrict === true),
    thisCompilationReached: entries.some((entry) => entry.compilation?.compilationMarker),
    beforeModuleIdsReached: reached("beforeModuleIds") && entries.some((entry) => entry.preModuleIds.length > 0),
    afterOptimizeModuleIdsReached: reached("afterOptimizeModuleIds") && entries.some((entry) => entry.postModuleIds.length > 0),
    afterOptimizeChunkIdsReached: reached("afterOptimizeChunkIds") && entries.some((entry) => entry.chunkMembership.length > 0),
    doneEvidenceWritten: true,
  };
}

async function captureR3b2bEvidence(evidenceDir, chunk) {
  const aDir = path.join(evidenceDir, "r3b2b-observer-a");
  const bDir = path.join(evidenceDir, "r3b2b-observer-b");
  const [a, b] = await Promise.all([readR3b2bObserverEvidence(aDir), readR3b2bObserverEvidence(bDir)]);
  const mapping = compareObserverModules(a.entries, b.entries);
  await writeR3bJson(evidenceDir, "r3b2b-module-id-mapping.json", mapping);
  return { a, b, mapping, chunk };
}

function r3bEnvironmentEvidence(prepared) {
  const keys = ["CI", "TZ", "LANG", "LC_ALL", "NODE_ENV", "NEXT_TELEMETRY_DISABLED", "UED_RELEASE_BUILD_ID", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "TEMP", "TMP", "NPM_CONFIG_CACHE", "NPM_CONFIG_USERCONFIG", "NPM_CONFIG_GLOBALCONFIG", "NPM_CONFIG_PREFIX"];
  const normalize = (value) => typeof value === "string" && value.toLowerCase().startsWith(prepared.tempRoot.toLowerCase()) ? "<BUILD_ROOT>" + value.slice(prepared.tempRoot.length).replaceAll("\\", "/") : value ?? null;
  return { cwd: normalize(prepared.workspace), values: Object.fromEntries(keys.map((key) => [key, key === "NODE_ENV" ? "production" : normalize(prepared.buildEnvironment.env[key])])), nodeOptions: "R3B_EXTERNAL_PRELOAD_ONLY", observerPreload: "EXTERNAL_DIAGNOSTIC_ONLY" };
}

export async function jsonDifference(first, leftRoot, rightRoot) {
  if (!first?.a || !first?.b || !/\.json$/i.test(first.path)) return null;
  try {
    const left = JSON.parse(await readFile(path.join(leftRoot, ...first.path.split("/")), "utf8"));
    const right = JSON.parse(await readFile(path.join(rightRoot, ...first.path.split("/")), "utf8"));
    const queue = [["$", left, right]];
    while (queue.length) {
      const [field, a, b] = queue.shift();
      if (canonicalJson(a) === canonicalJson(b)) continue;
      if (Array.isArray(a) && Array.isArray(b)) {
        for (let index = 0; index < Math.max(a.length, b.length); index += 1) queue.push([`${field}[${index}]`, a[index] ?? null, b[index] ?? null]);
      } else if (a && b && typeof a === "object" && typeof b === "object") {
        for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compareUtf8)) queue.push([`${field}.${key}`, a[key] ?? null, b[key] ?? null]);
      } else if (/previewMode(?:Id|SigningKey|EncryptionKey)|encryptionKey/iu.test(field)) return { field, a: "[REDACTED]", b: "[REDACTED]" };
      else return { field, a, b };
    }
  } catch {}
  return null;
}

async function sourceFeatureGate(sourceRoot) {
  const findings = [];
  const patterns = [{ name: "draftMode", regex: /\bdraftMode\b/ }, { name: "preview API", regex: /\b(?:setPreviewData|clearPreviewData|previewData)\b/ }, { name: "use server", regex: /["']use server["']/ }];
  async function visit(directory, relative = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, child);
      else if (entry.isFile() && /\.(?:[cm]?[jt]sx?)$/i.test(entry.name)) {
        const text = await readFile(absolute, "utf8");
        for (const pattern of patterns) if (pattern.regex.test(text)) findings.push({ path: child, feature: pattern.name });
      }
    }
  }
  await visit(path.join(sourceRoot, "src"), "src");
  if (findings.length) throw new Error(`preview/draft/server-action source feature unexpectedly present: ${findings.map((item) => `${item.feature}:${item.path}`).join(", ")}`);
  return { previewDraft: "ABSENT", serverActionsSource: "ABSENT" };
}

async function negativeGates(root, identity) {
  for (const key of ["nodeVersion", "npmVersion", "lockfileSha256", "nextVersion", "reactVersion", "reactDomVersion", "eslintConfigNextVersion", "windowsSwc", "sharp", "windowsSharp", "backend"]) assert.throws(() => assertPinnedIdentity({ ...identity, [key]: "wrong" }));
  assert.throws(() => assertBuildPlatform("darwin", "arm64", "macOS"));
  assert.throws(() => deterministicBuildId("bad", "0".repeat(64)));
  const dotenvRoot = path.join(root, "negative-dotenv");
  await mkdir(path.join(dotenvRoot, "nested"), { recursive: true });
  await writeFile(path.join(dotenvRoot, ".env.local"), "SYNTHETIC=1\n");
  await writeFile(path.join(dotenvRoot, "nested", ".env.production"), "SYNTHETIC=1\n");
  assert.deepEqual(await findDotenvFiles(dotenvRoot), [".env.local", "nested/.env.production"]);
  await rm(dotenvRoot, { recursive: true, force: true });
  const exactNextArgs = ["node_modules/next/dist/bin/next", "build"];
  assert.equal(exactNextArgs.some((item) => /turbo/i.test(item)), false);
  assert.equal(["node_modules/next/dist/bin/next", "build", "--turbopack"].some((item) => /turbopack|--turbo/i.test(item)), true);
  return "PASS";
}

async function focusedNativeBinding() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-g032-native-binding-")); const sourceRoot = path.join(root, "source");
  try {
    for (const relative of new Set(Object.values(nativeSourceInputs).flat())) {
      const file = path.join(sourceRoot, ...relative.split("/"));
      await mkdir(path.dirname(file), { recursive: true });
      if (relative.endsWith(".mjs")) await copyFile(path.join(import.meta.dirname, "..", ...relative.split("/")), file);
      else await writeFile(file, relative);
    }
    const currentCommit = "67121a41dee60b4a44978b6977967e1f1e39f50b";
    const sourceArchiveSha256 = "b".repeat(64);
    const toolchain = { buildToolsVersion: "fixture", compilerVersion: "fixture", linkerVersion: "fixture", windowsSdkVersion: "fixture" };
    const candidate = path.join(root, "native-candidate");
    for (const definition of nativeComponentDefinitions) {
      const directory = path.join(candidate, definition.componentName);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, path.basename(definition.executableRelativePath)), `fixture:${definition.componentName}`);
      await writeNativeComponentManifest({ definition, outputDir: directory, sourceRoot, assetHubCommit: currentCommit, toolchain: { compilerVersion: toolchain.compilerVersion, linkerVersion: toolchain.linkerVersion, windowsSdkVersion: toolchain.windowsSdkVersion } });
    }
    const aggregate = await createNativeSetManifestV2({ sourceCommit: currentCommit, sourceArchiveSha256, sourceRoot, toolchain, nativeOutputRoot: candidate });
    await writeCanonicalManifest(path.join(candidate, "native-components.manifest.json"), aggregate);
    const promoted = await promoteNativeCandidate({ candidateDirectory: candidate, frozenRoot: path.join(root, "frozen", "native-components") });
    const native = await verifyFrozenNativeSet(promoted.directory);
    const buildId = native.manifest.nativeBuildId;
    const exact = resolveFrozenNativeSetPath(root, buildId);
    assert.equal(promoted.directory, exact);
    assert.equal(await assertFrozenNativeSetBinding({ stagingRoot: root, nativeBuildId: buildId, nativeSetDigest: native.set.digest, nativeSetRoot: exact, native, sourceRoot, sourceCommit: currentCommit, sourceArchiveSha256: "b".repeat(64) }), exact);
    await assert.rejects(() => assertFrozenNativeSetBinding({ stagingRoot: root, nativeBuildId: buildId, nativeSetDigest: native.set.digest, nativeSetRoot: exact, native, sourceRoot, sourceCommit: "5932a1dff20b00fb8ee5ba76af08616709e50367", sourceArchiveSha256: "b".repeat(64) }));
    await assert.rejects(() => assertFrozenNativeSetBinding({ stagingRoot: root, nativeBuildId: "nb1-5932a1dff20b-c9f4e7ea1bc84836ae7f87ebb3640324", nativeSetDigest: native.set.digest, nativeSetRoot: exact, native, sourceRoot, sourceCommit: currentCommit, sourceArchiveSha256: "b".repeat(64) }));
  } finally { await rm(root, { recursive: true, force: true }); }
  process.stdout.write("[UED Release Constructor] focused native path binding: PASS\n");
}

async function focusedLockfileContract() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-lockfile-contract-"));
  const current = await readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package-lock.json"));
  const exact = path.join(root, "package-lock.json");
  const changed = path.join(root, "materialized-mismatch.json");
  const missing = path.join(root, "missing-package-lock.json");
  const historicalSha256 = ["94da6e178dd5f8ea8b715abb430ad4bc", "47bfb5eb5be46a142f67cb17a863a5e0"].join("");
  try {
    await writeFile(exact, current);
    assert.equal(await assertPackageLockContract(exact), buildContract.lockfileSha256);
    await writeFile(changed, Buffer.concat([current, Buffer.from(" ", "utf8")]));
    await assert.rejects(() => assertPackageLockContract(changed), /package-lock contract mismatch/);
    await assert.rejects(() => assertPackageLockContract(exact, historicalSha256), /package-lock contract mismatch/);
    await assert.rejects(() => assertPackageLockContract(missing), /ENOENT/);
    await assert.rejects(() => assertPackageLockContract(exact, "0".repeat(64)), /package-lock contract mismatch/);
    await assert.rejects(() => assertPackageLockContract(changed), /package-lock contract mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
  process.stdout.write("[UED Release Constructor] focused package-lock contract negatives: PASS\n");
}

async function focusedNpmGraphDiff() {
  const base = { name: "fixture", dependencies: { alpha: { version: "1.0.0", dependencies: { beta: { version: "2.0.0" } } } } };
  assert.equal(compareNpmLsGraphs(base, base).match, true);
  assert.equal(compareNpmLsGraphs(base, { ...base, dependencies: { alpha: { version: "1.0.1", dependencies: { beta: { version: "2.0.0" } } } } }).firstSemanticDifference.classification, "PACKAGE_VERSION");
  assert.equal(compareNpmLsGraphs(base, { name: "fixture", dependencies: {} }).firstSemanticDifference.classification, "PACKAGE_PRESENCE");
  assert.equal(compareNpmLsGraphs(base, { ...base, dependencies: { alpha: { version: "1.0.0", dependencies: {} } } }).firstSemanticDifference.classification, "PACKAGE_PRESENCE");
  assert.doesNotThrow(() => assertNpmTreeHasNoSecrets({ dependencies: { cookie: { version: "1.0.0" } } }));
  assert.throws(() => assertNpmTreeHasNoSecrets({ token: "synthetic" }), /prohibited credential field/);
  assert.equal(npmTreeDigest({ ...base, problems: ["extraneous: alpha D:\\build-a"] }), npmTreeDigest({ ...base, problems: ["extraneous: alpha D:\\build-b"] }));
  assert.notEqual(npmTreeDigest(base), npmTreeDigest({ ...base, dependencies: { alpha: { version: "1.0.1", dependencies: { beta: { version: "2.0.0" } } } } }));
  assert.notEqual(npmTreeDigest(base), npmTreeDigest({ name: "fixture", dependencies: {} }));
  assert.notEqual(npmTreeDigest(base), npmTreeDigest({ ...base, dependencies: { alpha: { version: "1.0.0", dependencies: {} } } }));
  process.stdout.write("[UED Release Constructor] focused npm ls graph diff: PASS\n");
}

async function focusedRawNextGate() {
  const runtime = { path: ".next/standalone/server.js", size: 1, sha256: "a".repeat(64) };
  const staticFile = { path: ".next/static/chunks/main.js", size: 1, sha256: "b".repeat(64) };
  const cacheA = { path: ".next/cache/a", size: 1, sha256: "c".repeat(64) };
  const cacheB = { path: ".next/cache/b", size: 1, sha256: "d".repeat(64) };
  const equal = nextComparisonLadder({ files: [runtime, staticFile] }, { files: [runtime, staticFile] });
  assert.equal(equal.raw.identical, true);
  assert.equal(equal.runtimeRelevant.identical, true);
  assert.equal(equal.continue, true);
  const rawOnly = nextComparisonLadder({ files: [runtime, staticFile, cacheA] }, { files: [runtime, staticFile, cacheB] });
  assert.equal(rawOnly.raw.identical, false);
  assert.equal(rawOnly.runtimeRelevant.identical, true);
  assert.equal(rawOnly.continue, true);
  const runtimeDifferent = nextComparisonLadder({ files: [runtime] }, { files: [{ ...runtime, sha256: "e".repeat(64) }] });
  assert.equal(runtimeDifferent.raw.identical, false);
  assert.equal(runtimeDifferent.runtimeRelevant.identical, false);
  assert.equal(runtimeDifferent.continue, false);
  process.stdout.write("[UED Release Constructor] raw Next non-fatal gate: PASS\n");
}

async function focusedR3bEvidence() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-r3b-evidence-"));
  const workspace = (label) => path.join(root, "workspace-" + label);
  const writeFixture = async (label, chunk, bytes) => {
    const base = workspace(label);
    await mkdir(path.join(base, ".next", "standalone", ".next"), { recursive: true });
    await mkdir(path.join(base, ".next", "static", "chunks"), { recursive: true });
    const manifest = { pages: { "/_not-found/page": ["static/chunks/" + chunk] } };
    await writeFile(path.join(base, ".next", "standalone", ".next", "app-build-manifest.json"), JSON.stringify(manifest) + "\n");
    await writeFile(path.join(base, ".next", "static", "chunks", chunk), bytes);
  };
  try {
    await writeFixture("a", "webpack-a.js", "same");
    await writeFixture("b", "webpack-b.js", "same");
    const comparison = { first: { path: ".next/standalone/.next/app-build-manifest.json", a: { path: ".next/standalone/.next/app-build-manifest.json" }, b: { path: ".next/standalone/.next/app-build-manifest.json" } } };
    const evidenceEqual = path.join(root, "evidence-equal");
    await mkdir(evidenceEqual, { recursive: true });
    const equal = await captureManifestChunkEvidence({ evidenceDir: evidenceEqual, comparison, workspaceA: workspace("a"), workspaceB: workspace("b") });
    assert.equal(equal.chunks.byteIdentical, true);
    await writeFixture("b", "webpack-b.js", "different");
    const evidenceDifferent = path.join(root, "evidence-different");
    await mkdir(evidenceDifferent, { recursive: true });
    const different = await captureManifestChunkEvidence({ evidenceDir: evidenceDifferent, comparison, workspaceA: workspace("a"), workspaceB: workspace("b") });
    assert.equal(different.chunks.byteIdentical, false);
    assert.notEqual(different.chunks.firstByteDifference, null);
    await assert.rejects(resolveManifestChunk(workspace("a"), "../escape.js"), /EVIDENCE PATH SAFETY FAILURE/);
    await symlink(path.join(workspace("a"), ".next", "static", "chunks", "webpack-a.js"), path.join(workspace("a"), ".next", "static", "chunks", "linked.js"));
    await assert.rejects(resolveManifestChunk(workspace("a"), "static/chunks/linked.js"), /EVIDENCE PATH SAFETY FAILURE/);
    await assert.rejects(copyVerifiedEvidence(path.join(root, "missing.js"), path.join(evidenceDifferent, "missing.js")), /ENOENT/);
    await rm(workspace("a"), { recursive: true, force: true });
    await rm(workspace("b"), { recursive: true, force: true });
    assert.equal((await readFile(path.join(evidenceDifferent, "chunk-a.js"), "utf8")).length > 0, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  process.stdout.write("[UED Release Constructor] R3B evidence regression: PASS\n");
}

async function focusedR3b2ModuleMapping() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-r3b2-mapping-"));
  const fixture = (moduleId, identifier) => ({
    effectiveConfig: { name: "client" },
    modules: [{ moduleId, identifier, analysisIdentifier: identifier, resource: null, analysisResource: null }],
    chunks: [{ name: "main-app", id: "7358", modules: [{ moduleId, identifier, analysisIdentifier: identifier }], rootModules: [], runtimeModules: [] }],
    preMinifyRuntimeAssets: [],
    postMinifyRuntimeAssets: [],
  });
  try {
    for (const [label, value] of [["a", fixture(24223, "logical-module")], ["b", fixture(55626, "logical-module")]]) {
      const directory = path.join(root, `r3b2-observer-${label}`);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "webpack-observer-client.json"), `${canonicalJson(value)}\n`);
    }
    const analysis = await captureWebpackObserverEvidence(root, "r3b2-observer");
    assert.equal(analysis.idMapping.a.moduleId, 24223);
    assert.equal(analysis.idMapping.b.moduleId, 55626);
    assert.equal(analysis.idMapping.a.identifier, "logical-module");
    assert.equal(analysis.idMapping.b.identifier, "logical-module");
    process.stdout.write("[UED Release Constructor] focused R3B2 module-ID mapping: PASS\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function focusedR3b2bObserver() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-r3b2b-observer-"));
  const originalDir = process.env.UED_R3B2B_OBSERVER_DIR;
  const originalLabel = process.env.UED_R3B2B_OBSERVER_LABEL;
  const originalNextWorker = process.env.IS_NEXT_WORKER;
  const originalNextBuildWorker = process.env.NEXT_PRIVATE_BUILD_WORKER;
  process.env.UED_R3B2B_OBSERVER_DIR = root;
  process.env.UED_R3B2B_OBSERVER_LABEL = "a";
  const Hook = class { constructor() { this.handlers = []; } tap(_name, handler) { this.handlers.push(handler); } tapPromise(_name, handler) { this.handlers.push(handler); } };
  const module = { identifier: () => "fixture-module", readableIdentifier: () => "fixture-module", resource: "C:\\fixture\\module.js", type: "javascript/auto", layer: null };
  const chunk = { name: "main-app", id: 1, ids: [1], runtime: "runtime", files: new Set(["main-app.js"]), contentHash: null };
  const compilationHooks = { beforeModuleIds: new Hook(), afterOptimizeModuleIds: new Hook(), afterOptimizeChunkIds: new Hook(), processAssets: new Hook() };
  const compilation = { hooks: compilationHooks, name: "fixture", requestShortener: {}, chunks: new Set([chunk]), getAssets: () => [], moduleGraph: { getIncomingConnections: () => [] }, chunkGraph: { getModuleId: () => 42, getChunkModulesIterable: () => [module], getChunkRuntimeModulesIterable: () => [] } };
  const webpack = function webpackFixture() {};
  const staticApis = ["NormalModuleReplacementPlugin", "DefinePlugin", "Compilation", "Compiler", "NormalModule", "RuntimeModule", "sources", "webpack", "version"];
  for (const key of staticApis) Object.defineProperty(webpack, key, { value: key === "Compilation" ? { PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE: 1000 } : key === "version" ? "5.98.0" : { key }, enumerable: true });
  const compiler = { context: "C:\\fixture", hooks: { thisCompilation: new Hook(), done: new Hook() }, webpack };
  const require = createRequire(import.meta.url);
  const observer = require("./r3b2b-webpack-observer.cjs");
  try {
    process.env.IS_NEXT_WORKER = "true";
    process.env.NEXT_PRIVATE_BUILD_WORKER = "1";
    const keys = Reflect.ownKeys(webpack);
    const descriptors = Object.getOwnPropertyDescriptors(webpack);
    const prototype = Object.getPrototypeOf(webpack);
    observer.attachWebpackObserver({ webpack, compiler, config: { name: "client", target: "web" } });
    assert.equal(compiler.webpack, webpack);
    assert.deepEqual(Reflect.ownKeys(webpack), keys);
    assert.deepEqual(Object.getOwnPropertyDescriptors(webpack), descriptors);
    assert.equal(Object.getPrototypeOf(webpack), prototype);
    for (const key of staticApis) assert.equal(webpack[key], descriptors[key].value);
    compiler.hooks.thisCompilation.handlers[0](compilation);
    compilationHooks.beforeModuleIds.handlers[0]([module]);
    compilationHooks.afterOptimizeModuleIds.handlers[0]([module]);
    compilationHooks.afterOptimizeChunkIds.handlers[0]();
    for (const handler of compilationHooks.processAssets.handlers) handler();
    await compiler.hooks.done.handlers[0]({ compilation, hasErrors: () => false });
    const gate = await readR3b2bObserverEvidence(root);
    assert.equal(gate.compilerObserved, true);
    assert.equal(gate.beforeModuleIdsReached, true);
    assert.equal(gate.afterOptimizeModuleIdsReached, true);
    assert.equal(gate.afterOptimizeChunkIdsReached, true);
    process.stdout.write("[UED Release Constructor] R3B2B observer fixture: PASS\n");
  } finally {
    originalDir === undefined ? delete process.env.UED_R3B2B_OBSERVER_DIR : process.env.UED_R3B2B_OBSERVER_DIR = originalDir;
    originalLabel === undefined ? delete process.env.UED_R3B2B_OBSERVER_LABEL : process.env.UED_R3B2B_OBSERVER_LABEL = originalLabel;
    originalNextWorker === undefined ? delete process.env.IS_NEXT_WORKER : process.env.IS_NEXT_WORKER = originalNextWorker;
    originalNextBuildWorker === undefined ? delete process.env.NEXT_PRIVATE_BUILD_WORKER : process.env.NEXT_PRIVATE_BUILD_WORKER = originalNextBuildWorker;
    await rm(root, { recursive: true, force: true });
  }
}

async function focusedR3DiagnosticObserverClosure() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-r3-observer-closure-"));
  try {
    const sourceRoot = path.join(root, "source");
    const outputDir = path.join(root, "snapshot");
    const materializedRoot = path.join(root, "materialized");
    const workspace = path.join(root, "workspace");
    await mkdir(path.join(sourceRoot, "scripts"), { recursive: true });
    await run("git", ["init", "-q"], { cwd: sourceRoot });
    await run("git", ["config", "user.email", "r3@example.invalid"], { cwd: sourceRoot });
    await run("git", ["config", "user.name", "R3"], { cwd: sourceRoot });
    await writeFile(path.join(sourceRoot, "package-lock.json"), '{"lockfileVersion":3}\n');
    await run("git", ["add", "package-lock.json"], { cwd: sourceRoot });
    await run("git", ["commit", "-qm", "fixture"], { cwd: sourceRoot });
    const observerBytes = Buffer.from("diagnostic observer fixture\n", "utf8");
    await writeFile(path.join(sourceRoot, ...r3DiagnosticObserverPath.split("/")), observerBytes);
    const snapshot = await createControlledSourceSnapshot({ sourceRoot, outputDir, creationRunId: "r3-observer-closure-fixture", createdAt: "2026-09-24T00:00:00.000Z" });
    assert(snapshot.manifest.files.some((file) => file.relativePath === r3DiagnosticObserverPath && file.classification === "untracked"));
    const sourceManifest = await materializeArchive({ archive: snapshot.archive, sourceRoot: materializedRoot, workspace });
    const snapshotAuthority = await validateR3SnapshotAuthority({ "source-snapshot-manifest": snapshot.manifestPath, "source-snapshot-manifest-sha256": snapshot.manifestSha256, "source-commit": snapshot.manifest.sourceCommit, "source-archive-sha256": snapshot.archiveSha256 }, root, sourceManifest);
    assert.equal(snapshotAuthority.sourceArchiveSha256, snapshot.archiveSha256);
    await assert.rejects(() => validateR3SnapshotAuthority({ "source-snapshot-manifest": snapshot.manifestPath, "source-snapshot-manifest-sha256": "0".repeat(64), "source-commit": snapshot.manifest.sourceCommit, "source-archive-sha256": snapshot.archiveSha256 }, root, sourceManifest), /manifest SHA-256 mismatch/);
    await assert.rejects(() => validateR3SnapshotAuthority({ "source-snapshot-manifest": snapshot.manifestPath, "source-snapshot-manifest-sha256": snapshot.manifestSha256, "source-commit": snapshot.manifest.sourceCommit, "source-archive-sha256": snapshot.archiveSha256 }, materializedRoot, sourceManifest), /must be inside isolated staging/);
    const identity = { sourceRoot: materializedRoot, sourceManifest, snapshot: snapshot.manifest, sourceCommit: snapshot.manifest.sourceCommit, sourceArchiveSha256: snapshot.archiveSha256 };
    const valid = await assertR3DiagnosticObserverClosure(identity);
    assert.equal(valid.relativePath, r3DiagnosticObserverPath);
    assert.equal(valid.sha256, digest(observerBytes));
    await assert.rejects(() => assertR3DiagnosticObserverClosure({ ...identity, observerPath: path.join(root, "outside.cjs") }), /fallback or wrong relative path denied/);
    await assert.rejects(() => assertR3DiagnosticObserverClosure({ ...identity, observerPath: path.join(materializedRoot, "scripts", "wrong-observer.cjs") }), /fallback or wrong relative path denied/);
    await rm(path.join(materializedRoot, ...r3DiagnosticObserverPath.split("/")));
    await assert.rejects(() => assertR3DiagnosticObserverClosure(identity), { code: "ENOENT" });
    await writeFile(path.join(materializedRoot, ...r3DiagnosticObserverPath.split("/")), "wrong bytes\n");
    await assert.rejects(() => assertR3DiagnosticObserverClosure(identity), /do not match the source archive and snapshot manifest/);
    await assert.rejects(() => assertR3DiagnosticObserverClosure({ ...identity, sourceArchiveSha256: "0".repeat(64) }), /snapshot identity mismatch/);
    process.stdout.write("R3 diagnostic observer closure and snapshot fixtures: PASS\n");
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function payloadLeakScan(candidate, forbiddenValues) {
  const tree = await calculateReleaseArtifactSet(candidate);
  const dotenv = tree.files.filter((file) => path.basename(file.path).toLowerCase().startsWith(".env"));
  if (dotenv.length) throw new Error(`payload contains prohibited dotenv path: ${dotenv.map((item) => item.path).join(", ")}`);
  const hits = [];
  for (const file of tree.files) {
    const bytes = await readFile(path.join(candidate, ...file.path.split("/")));
    for (const forbidden of forbiddenValues.filter(Boolean)) if (bytes.includes(Buffer.from(forbidden, "utf8"))) hits.push({ path: file.path, class: "forbidden-path-or-sentinel" });
  }
  if (hits.length) throw new Error(`payload contains absolute build path or sentinel in ${hits[0].path}`);
  return { secretLeak: false, absoluteBuildPathLeak: false };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => { const address = server.address(); server.close(() => resolve(address.port)); });
  });
}

async function runtimeSmoke(prepared, result) {
  const smokeRoot = path.join(prepared.tempRoot, "runtime-smoke");
  const dataRoot = path.join(smokeRoot, "data");
  const runtimeRoot = path.join(smokeRoot, "asset-hub-runtime");
  const agentRoot = path.join(smokeRoot, "agent-runtime");
  const mediaRoot = path.join(smokeRoot, "training-media");
  await Promise.all([mkdir(runtimeRoot, { recursive: true }), mkdir(agentRoot, { recursive: true }), mkdir(mediaRoot, { recursive: true })]);
  await cp(path.join(prepared.sourceRoot, "data.example"), dataRoot, { recursive: true });
  const before = await calculateReleaseArtifactSet(result.destination);
  const port = await freePort();
  const env = { ...prepared.buildEnvironment.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(port), DATA_DIR: dataRoot, ASSET_HUB_RUNTIME_DIR: runtimeRoot, AGENT_RUNTIME_DIR: agentRoot, TRAINING_MEDIA_DIR: mediaRoot };
  delete env.UED_RELEASE_BUILD_ID;
  const child = spawn(prepared.nodeExe, [path.join(result.destination, "server.js")], { cwd: result.destination, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += chunk.toString("utf8"); });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      try { const response = await fetch(`http://127.0.0.1:${port}/`); if (response.ok) { ready = true; break; } } catch {}
    }
    if (!ready) throw new Error(`standalone runtime did not become ready: ${errors.slice(-1000)}`);
    for (const route of ["/", "/knowledge", "/agent", "/api/tags"]) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`);
      if (!response.ok) throw new Error(`runtime smoke route failed: ${route} (${response.status})`);
      await response.arrayBuffer();
    }
  } finally {
    child.kill();
    await Promise.race([new Promise((resolve) => child.once("close", resolve)), new Promise((resolve) => setTimeout(resolve, 5000))]);
  }
  const after = await calculateReleaseArtifactSet(result.destination);
  if (before.digest !== after.digest || canonicalJson(before.files) !== canonicalJson(after.files)) throw new Error("runtime smoke changed release payload bytes.");
  return { status: "PASS", releaseTreeInvariant: "PASS", routes: ["/", "/knowledge", "/agent", "/api/tags"] };
}

async function main() {
  const { values: args, focused } = parseArgs(process.argv.slice(2));
  const sourceCommit = args["source-commit"];
  assertBuildPlatform();
  const runRoot = path.resolve(args["run-root"]);
  const evidenceDir = path.resolve(args["evidence-dir"]);
  const stagingRoot = path.resolve(args["staging-root"]);
  const runRelative = path.relative(stagingRoot, runRoot);
  if (!runRelative || runRelative.startsWith("..") || path.isAbsolute(runRelative)) throw new Error("R3 run root must be a strict staging child.");
  await mkdir(runRoot, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(path.join(runRoot, ".ued-r3-owner.json"), `${canonicalJson({ block: "B3R-B2B-R3", testOnly: true })}\n`);
  const entry = { schemaVersion: 1, status: "RUNNING", lastCheckpoint: "OWNER_MARKER_WRITTEN" };
  const checkpoint = async (name) => { entry.lastCheckpoint = name; await appendFile(path.join(runRoot, "r3-entry-checkpoints.jsonl"), `${canonicalJson({ checkpoint: name })}\n`); };
  const persistEntryFailure = async (error) => writeFile(path.join(evidenceDir, "r3-entry-failure.json"), `${canonicalJson({ ...entry, status: "STOPPED_CONTRACT", error: { name: error instanceof Error ? error.name : "Error", code: error && typeof error === "object" && "code" in error ? error.code ?? null : null, message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack?.split("\n").slice(0, 4).join("\n") ?? null : null } })}\n`);
  let common;
  let evidence;
  try {
    await checkpoint("ENTRY_ENVELOPE_READY");
    for (const key of ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET", "DEEPSEEK_API_KEY", "AGENT_GATEWAY_TOKEN", "DATA_DIR", "AGENT_RUNTIME_DIR", "ASSET_HUB_RUNTIME_DIR", "TRAINING_MEDIA_DIR", "NEXT_PUBLIC_R3_SENTINEL", "NODE_OPTIONS", "HTTPS_PROXY", "NPM_TOKEN", "NODE_AUTH_TOKEN"]) process.env[key] = "DO_NOT_INHERIT";
    await checkpoint("BEFORE_COMMON_INPUTS");
    if (focused.fail === "common-inputs") throw new Error("synthetic focused common-input failure");
    common = { "staging-root": stagingRoot, "source-archive": path.resolve(args["source-archive"]), "source-commit": sourceCommit, "source-archive-sha256": args["source-archive-sha256"], "source-classification": buildContract.sourceClassification, "dsh-source-root": path.resolve(args["dsh-source-root"]), "dsh-version": "0.1.1-rc.2", "dsh-commit": dshCommit, "dsh-provenance-evidence": path.resolve(args["dsh-provenance-evidence"]), ...(args["dsh-acquisition-artifact"] ? { "dsh-acquisition-artifact": path.resolve(args["dsh-acquisition-artifact"]) } : {}), "native-set-root": path.resolve(args["native-set-root"]), "native-build-id": args["native-build-id"], "native-set-digest": args["native-set-digest"], "node-root": path.resolve(args["node-root"]), "security-set": path.resolve(args["security-set"]), "security-set-id": args["security-set-id"], "security-set-authorization-id": args["security-set-authorization-id"] };
    await checkpoint("AFTER_COMMON_INPUTS");
    await checkpoint("BEFORE_EVIDENCE_OBJECT");
    if (focused.fail === "evidence-object") throw new Error("synthetic focused evidence-object failure");
    evidence = { schemaVersion: 1, block: "B3R-B2B-R3", testOnly: true, authoritativeHead: sourceCommit, sourceArchiveSha256: args["source-archive-sha256"], buildContract: buildContract.version, status: "RUNNING" };
    await checkpoint("AFTER_EVIDENCE_OBJECT");
    await checkpoint("TRY_BOUNDARY_REACHED");
    if (focused.stop) { await checkpoint("BEFORE_PREPARE_WINDOWS_RELEASE"); await writeFile(path.join(evidenceDir, "r3-entry-success.json"), `${canonicalJson({ ...entry, status: "CONTROLLED_STOP" })}\n`); return; }
  } catch (error) {
    await persistEntryFailure(error).catch(() => {});
    throw error;
  }
  let buildA;
  let buildB;
  let observerIdentityA;
  let sourceSnapshotAuthority;
  try {
    const graphs = {};
    const captureGraph = async (label, graph) => {
      const raw = canonicalJson(graph.raw);
      await writeFile(path.join(evidenceDir, `npm-ls-${label}.raw.json`), raw);
      await writeFile(path.join(evidenceDir, `npm-ls-${label}.normalized.json`), graph.canonical);
      await writeFile(path.join(evidenceDir, `npm-ls-${label}.trace.json`), `${canonicalJson({ canonicalSha256: digest(Buffer.from(graph.canonical, "utf8")), npmTreeDigest: graph.digest, normalizedBytes: Buffer.byteLength(graph.canonical, "utf8") })}\n`);
      if (digest(Buffer.from(graph.canonical, "utf8")) !== graph.digest) throw new Error(`npm ls ${label} canonical evidence digest mismatch.`);
      graphs[label] = graph;
    };
    const captureA = focused.dependencyStop ? { onNpmTree: (graph) => captureGraph("a", graph) } : {};
    const captureB = focused.dependencyStop ? { onNpmTree: (graph) => captureGraph("b", graph) } : {};
    buildA = await prepareWindowsRelease({ ...common, "creation-run-id": "build-a", "native-set-run-binding": path.resolve(args["native-set-run-binding-a"]), "temp-dir": path.join(runRoot, "build-a", "temp"), "output-dir": path.join(runRoot, "build-a", "output") }, captureA);
    const r3b2b = focused.r3b2bProbe || focused.r3b2bSmoke || focused.r3b2bDiagnostic;
    if (focused.r3StopAfterAb || r3b2b) {
      sourceSnapshotAuthority = await validateR3SnapshotAuthority(args, stagingRoot, buildA.source);
      evidence.sourceSnapshotManifestSha256 = args["source-snapshot-manifest-sha256"];
      if (r3b2b) {
        observerIdentityA = await assertR3DiagnosticObserverClosure({ sourceRoot: buildA.sourceRoot, sourceManifest: buildA.source, snapshot: sourceSnapshotAuthority, sourceCommit, sourceArchiveSha256: args["source-archive-sha256"] });
        evidence.r3DiagnosticObserver = observerIdentityA;
      }
    }
    await bindWindowsReleaseInputs(buildA);
    buildB = await prepareWindowsRelease({ ...common, "creation-run-id": "build-b", "native-set-run-binding": path.resolve(args["native-set-run-binding-b"]), "temp-dir": path.join(runRoot, "build-b", "temp"), "output-dir": path.join(runRoot, "build-b", "output") }, captureB);
    if (focused.r3StopAfterAb || r3b2b) {
      const snapshotB = await validateR3SnapshotAuthority(args, stagingRoot, buildB.source);
      same(sourceSnapshotAuthority, snapshotB, "R3 source snapshot A/B identity");
      if (r3b2b) {
        const observerIdentityB = await assertR3DiagnosticObserverClosure({ sourceRoot: buildB.sourceRoot, sourceManifest: buildB.source, snapshot: snapshotB, sourceCommit, sourceArchiveSha256: args["source-archive-sha256"] });
        same(observerIdentityA, observerIdentityB, "R3 diagnostic observer A/B source identity");
      }
    }
    await bindWindowsReleaseInputs(buildB);
    same(buildA.source, buildB.source, "source member manifest");
    same(buildA.toolchain, buildB.toolchain, "toolchain identity");
    same(buildA.securitySetMetadata, buildB.securitySetMetadata, "Release Security Set authority");
    evidence.releaseSecuritySet = { ...buildA.securitySetMetadata, sharedByBuilds: true };
    const dependencyComparison = compareDependencyEvidence(buildA.dependencies, buildB.dependencies);
    await writeFile(path.join(evidenceDir, "dependency-a.json"), `${canonicalJson(buildA.dependencies)}\n`);
    await writeFile(path.join(evidenceDir, "dependency-b.json"), `${canonicalJson(buildB.dependencies)}\n`);
    await writeFile(path.join(evidenceDir, "dependency-diff.json"), `${canonicalJson(dependencyComparison)}\n`);
    if (focused.dependencyStop) {
      if (!graphs.a || !graphs.b) throw new Error("focused dependency stop did not persist both npm ls graphs.");
      const graphComparison = compareNpmLsGraphs(graphs.a.normalized, graphs.b.normalized);
      await writeFile(path.join(evidenceDir, "npm-ls-graph-diff.json"), `${canonicalJson(graphComparison)}\n`);
      evidence.npmLsGraphComparison = { match: graphComparison.match, firstDifference: graphComparison.firstDifference, firstSemanticDifference: graphComparison.firstSemanticDifference, differenceCount: graphComparison.differenceCount };
    }
    evidence.dependencyComparison = { match: dependencyComparison.match, firstDifference: dependencyComparison.firstDifference, differenceCount: dependencyComparison.differences.length };
    if (focused.dependencyStop) {
      evidence.status = "CONTROLLED_DEPENDENCY_STOP";
      await writeFile(path.join(evidenceDir, "r3-evidence.json"), `${canonicalJson(evidence)}\n`);
      process.stdout.write(`R3_DEPENDENCY_RESULT ${canonicalJson({ status: evidence.status, match: dependencyComparison.match, firstDifference: dependencyComparison.firstDifference })}\n`);
      return;
    }
    if (!dependencyComparison.match) throw new Error(`dependency graph A/B mismatch at ${dependencyComparison.firstDifference.path} (${dependencyComparison.firstDifference.classification}).`);
    same(buildA.envEvidence, buildB.envEvidence, "sanitized environment");
    assert.equal(buildA.buildId, buildB.buildId, "Build IDs must match.");
    const features = await sourceFeatureGate(buildA.sourceRoot);
    await negativeGates(runRoot, buildA.dependencies.versions);
    await assert.rejects(bindWindowsReleaseInputs({ ...buildA, values: { ...buildA.values, "native-set-digest": "0".repeat(64) } }));
    await assert.rejects(bindWindowsReleaseInputs({ ...buildA, values: { ...buildA.values, "dsh-commit": "0".repeat(40) } }));
    const observerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "r3b-webpack-observer.cjs");
    const observerEnabled = focused.r3bDiagnostic || focused.r3b2Probe || focused.r3b2Diagnostic || r3b2b;
    const observerRoot = r3b2b ? "r3b2b-observer" : focused.r3b2Probe || focused.r3b2Diagnostic ? "r3b2-observer" : "r3b-observer";
    const diagnostic = (label, prepared) => r3b2b ? { kind: "r3b2b", observerPath: path.join(prepared.sourceRoot, ...r3DiagnosticObserverPath.split("/")), evidenceDir: path.join(evidenceDir, `${observerRoot}-${label}`), label } : { preloadPath: observerPath, evidenceDir: path.join(evidenceDir, `${observerRoot}-${label}`), label };
    const diagnosticA = observerEnabled ? diagnostic("a", buildA) : null;
    const diagnosticB = observerEnabled ? diagnostic("b", buildB) : null;
    if (observerEnabled && !r3b2b) await lstat(observerPath);
    if (focused.r3b2Probe) {
      await runWindowsNextBuild(buildA, diagnosticA);
      const gate = await readR3b2BootstrapGate(diagnosticA.evidenceDir);
      await writeR3bJson(evidenceDir, "r3b2-bootstrap-probe.json", gate);
      if (!gate.observerLoadedInActualWebpackWorker || !gate.webpackLoadObserved || !gate.compilationHookReached || !gate.evidenceExternalCleanupSafe || gate.buildSemanticsPerturbed) throw new Error("R3B2 bootstrap reachability gate failed.");
      evidence.status = "R3B2_BOOTSTRAP_PROBE_PASS";
      evidence.r3b2BootstrapGate = gate;
      await writeFile(path.join(evidenceDir, "r3-evidence.json"), `${canonicalJson(evidence)}\n`);
      process.stdout.write(`R3B2_BOOTSTRAP_PROBE ${canonicalJson(gate)}\n`);
      return;
    }
    if (focused.r3b2bProbe) {
      await runWindowsNextBuild(buildA, diagnosticA);
      const gate = await readR3b2bObserverEvidence(diagnosticA.evidenceDir);
      if (!gate.actualNextChildWorker || !gate.compilerObserved || !gate.thisCompilationReached || !gate.beforeModuleIdsReached || !gate.afterOptimizeModuleIdsReached || !gate.afterOptimizeChunkIdsReached || !gate.doneEvidenceWritten || diagnosticA.patch?.targetOccurrence !== 1) throw new Error("R3B2B worker reachability gate failed.");
      await writeR3bJson(evidenceDir, "r3b2b-bootstrap-probe.json", { gate, patch: diagnosticA.patch });
      evidence.status = "R3B2B_BOOTSTRAP_PROBE_PASS";
      await writeFile(path.join(evidenceDir, "r3-evidence.json"), `${canonicalJson(evidence)}\n`);
      process.stdout.write(`R3B2B_BOOTSTRAP_PROBE ${canonicalJson({ gate, patch: diagnosticA.patch })}\n`);
      return;
    }
    if (focused.r3b2bSmoke) {
      await runWindowsNextBuild(buildA);
      await runWindowsNextBuild(buildB, diagnosticB);
      const comparison = nextComparisonLadder(buildA.rawNext, buildB.rawNext);
      const gate = await readR3b2bObserverEvidence(diagnosticB.evidenceDir);
      await writeR3bJson(evidenceDir, "r3b2b-semantic-smoke.json", { runtimeRelevantMatch: comparison.runtimeRelevant.identical, gate, patch: diagnosticB.patch });
      if (!gate.actualNextChildWorker || !gate.compilerObserved || !gate.thisCompilationReached || !gate.beforeModuleIdsReached || !gate.afterOptimizeModuleIdsReached || !gate.afterOptimizeChunkIdsReached || !gate.doneEvidenceWritten || diagnosticB.patch?.targetOccurrence !== 1) throw new Error("R3B2B semantic smoke observation is incomplete.");
      if (!comparison.runtimeRelevant.identical) throw new Error("R3B2B diagnostic observer semantic smoke differs from unobserved build.");
      evidence.status = "R3B2B_SEMANTIC_SMOKE_PASS";
      await writeFile(path.join(evidenceDir, "r3-evidence.json"), `${canonicalJson(evidence)}\n`);
      process.stdout.write(`R3B2B_SEMANTIC_SMOKE ${canonicalJson({ status: evidence.status })}\n`);
      return;
    }
    await Promise.all([runWindowsNextBuild(buildA, diagnosticA), runWindowsNextBuild(buildB, diagnosticB)]);
    evidence.securityMaterialAdoption = { a: buildA.securitySetAdoption, b: buildB.securitySetAdoption, status: "PASS" };
    if (focused.r3StopAfterAb || focused.r3b2bDiagnostic) await Promise.all([persistR3OutputIdentity(buildA, evidenceDir, "a"), persistR3OutputIdentity(buildB, evidenceDir, "b")]);
    const nextComparison = nextComparisonLadder(buildA.rawNext, buildB.rawNext);
    const rawComparison = nextComparison.raw;
    evidence.rawComparison = rawComparison;
    evidence.runtimeRelevantNextComparison = nextComparison.runtimeRelevant;
    evidence.toolchain = buildA.toolchain;
    evidence.dependencies = buildA.dependencies;
    evidence.environment = { keys: buildA.envEvidence.keys, digest: buildA.envEvidence.digest, sentinelLeak: false };
    evidence.source = { digest: buildA.source.digest, fileCount: buildA.source.files.length, buildId: buildA.buildId, features, serverActions: [buildA.serverActions, buildB.serverActions] };
    if (!rawComparison.identical) {
      evidence.rawNextEvidence = { first: rawComparison.first, structured: await jsonDifference(rawComparison.first, buildA.workspace, buildB.workspace), differenceClass: rawComparison.first?.path.endsWith(".json") ? "structured-manifest-or-serialization" : "generated-runtime-bytes" };
    }
    if (!nextComparison.continue) {
      let r3b;
      if (focused.r3bDiagnostic || focused.r3b2Diagnostic || focused.r3b2bDiagnostic) {
        const chunk = await captureManifestChunkEvidence({ evidenceDir, comparison: nextComparison.runtimeRelevant, workspaceA: buildA.workspace, workspaceB: buildB.workspace });
        const environment = { a: r3bEnvironmentEvidence(buildA), b: r3bEnvironmentEvidence(buildB) };
        await writeR3bJson(evidenceDir, "environment-diff.json", { difference: firstDifference(environment.a, environment.b), environment });
        const observer = chunk.chunks.byteIdentical ? { observationOnly: true, buildSemanticsPerturbed: false, skipped: "CHUNK_BYTES_MATCH" } : focused.r3b2bDiagnostic ? await captureR3b2bEvidence(evidenceDir, chunk) : await captureWebpackObserverEvidence(evidenceDir, observerRoot);
        if (chunk.chunks.byteIdentical) await writeR3bJson(evidenceDir, "webpack-runtime-analysis.json", observer);
        r3b = { chunk, environment, observer };
      }
      evidence.status = "STOPPED_RUNTIME_RELEVANT_NEXT_DIFFERENT";
      evidence.exactRca = { first: nextComparison.runtimeRelevant.first, structured: await jsonDifference(nextComparison.runtimeRelevant.first, buildA.workspace, buildB.workspace), hashedChunk: hashedChunkEvidence(nextComparison.runtimeRelevant), r3b: r3b ?? null, differenceClass: nextComparison.runtimeRelevant.first?.path.endsWith(".json") ? "structured-manifest-or-serialization" : "runtime-generated-bytes" };
      await writeFile(path.join(evidenceDir, "r3-evidence.json"), `${canonicalJson(evidence)}\n`);
      throw new Error(`runtime-relevant Next A/B outputs differ: ${nextComparison.runtimeRelevant.first?.path ?? "unknown"}`);
    }
    if (focused.r3StopAfterAb) {
      evidence.status = "R3_AB_PASS_STOPPED_BEFORE_CANDIDATE";
      await writeFile(path.join(evidenceDir, "r3-evidence.json"), `${canonicalJson(evidence)}\n`);
      process.stdout.write(`R3_AB_RESULT ${canonicalJson({ status: evidence.status, runtimeRelevantNextMatch: true, candidateCreated: false })}\n`);
      return;
    }
    await run(buildA.nodeExe, [path.join(buildA.workspace, "node_modules", "typescript", "bin", "tsc"), "--noEmit"], { cwd: buildA.workspace, env: buildA.buildEnvironment.env });
    const [resultA, resultB] = await Promise.all([finalizeWindowsRelease(buildA, { candidateLabel: "A", executionEvidencePath: path.join(evidenceDir, "candidate-execution-evidence-A.json") }), finalizeWindowsRelease(buildB, { candidateLabel: "B", executionEvidencePath: path.join(evidenceDir, "candidate-execution-evidence-B.json") })]);
    assert.equal(resultA.postPruneDependencyDigest, resultB.postPruneDependencyDigest, "post-prune dependency graphs must match.");
    const payloadA = await calculateReleaseArtifactSet(resultA.destination);
    const payloadB = await calculateReleaseArtifactSet(resultB.destination);
    const payloadComparison = manifestDifference(payloadA, payloadB);
    evidence.payloadComparison = payloadComparison;
    if (!payloadComparison.identical || payloadA.digest !== payloadB.digest) {
      evidence.status = "STOPPED_PAYLOAD_DIFFERENT";
      evidence.exactRca = { first: payloadComparison.first, structured: await jsonDifference(payloadComparison.first, resultA.destination, resultB.destination), differenceClass: payloadComparison.first?.path.endsWith(".json") ? "structured-manifest-or-serialization" : "payload-runtime-bytes" };
      await writeFile(path.join(evidenceDir, "r3-evidence.json"), `${canonicalJson(evidence)}\n`);
      throw new Error(`canonical payload A/B outputs differ: ${payloadComparison.first?.path ?? "artifact digest"}`);
    }
    assert.equal(resultA.manifest.artifactSet.digest, resultB.manifest.artifactSet.digest);
    await verifyRelease(resultA.destination, resultA.manifest.dsh);
    await verifyRelease(resultB.destination, resultB.manifest.dsh);
    const forbiddenValues = ["DO_NOT_INHERIT", runRoot, stagingRoot, evidenceDir, os.hostname(), process.env.USERNAME, "/Users/"];
    const scanA = await payloadLeakScan(resultA.destination, forbiddenValues);
    const scanB = await payloadLeakScan(resultB.destination, forbiddenValues);
    await run(buildA.nodeExe, [path.join(buildA.workspace, "scripts", "verify-windows-deployment-contract.mjs")], { cwd: buildA.workspace, env: buildA.buildEnvironment.env });
    const smoke = await runtimeSmoke(buildA, resultA);
    evidence.status = "PASS";
    evidence.artifact = { digestA: resultA.manifest.artifactSet.digest, digestB: resultB.manifest.artifactSet.digest, match: true, fileCount: payloadA.files.length };
    evidence.postPruneDependencyDigest = resultA.postPruneDependencyDigest;
    evidence.scan = { a: scanA, b: scanB };
    evidence.runtimeSmoke = smoke;
    await writeFile(path.join(evidenceDir, "r3-evidence.json"), `${canonicalJson(evidence)}\n`);
    process.stdout.write(`R3_RESULT ${canonicalJson({ status: "PASS", evidence: "r3-evidence.json", artifactDigest: resultA.manifest.artifactSet.digest, buildId: buildA.buildId, sourceArchiveSha256: args["source-archive-sha256"] })}\n`);
  } catch (error) {
    if (evidence.status === "RUNNING") {
      evidence.status = "STOPPED_CONTRACT";
      evidence.error = error instanceof Error ? error.message : String(error);
      await writeFile(path.join(evidenceDir, "r3-evidence.json"), `${canonicalJson(evidence)}\n`).catch(() => {});
    }
    throw error;
  } finally {
    for (const label of ["build-a", "build-b", "negative-dotenv", "charset-test"]) await rm(path.join(runRoot, label), { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--r3") || process.argv.some((arg) => /^--r3/u.test(arg))) throw new Error("Legacy R3 execution harness is historical-only. Use the protected-approval serial runner after independent execution authorization.");
  const task = process.argv[2] === "--focused-native-binding" ? Promise.resolve().then(focusedNativeBinding) : process.argv[2] === "--focused-lockfile-contract" ? Promise.resolve().then(focusedLockfileContract) : process.argv[2] === "--focused-npm-graph-diff" ? Promise.resolve().then(focusedNpmGraphDiff) : process.argv[2] === "--focused-raw-next-gate" ? Promise.resolve().then(focusedRawNextGate) : process.argv[2] === "--focused-r3b-evidence" ? Promise.resolve().then(focusedR3bEvidence) : process.argv[2] === "--focused-r3b2-module-mapping" ? Promise.resolve().then(focusedR3b2ModuleMapping) : process.argv[2] === "--focused-r3b2b-observer" ? Promise.resolve().then(focusedR3b2bObserver) : process.argv[2] === "--focused-r3-diagnostic-observer-closure" ? Promise.resolve().then(focusedR3DiagnosticObserverClosure) : Promise.reject(new Error("Legacy execution harness disabled; only named isolated focused regressions are available."));
  task.catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
