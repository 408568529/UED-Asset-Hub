import { createHash } from "node:crypto";
import ts from "typescript";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHostRuntimeClosureBinding } from "./release-runtime-closure-contract.mjs";

const sourceTemplatePath = "service/windows/UEDAssetHub.xml.template";
const moduleExtensions = [".mjs", ".js", ".cjs", ".json"];
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
const inside = (root, target) => { const relative = path.relative(root, target); return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)); };
const toPosix = (value) => value.split(path.sep).join("/");

function fail(message) { throw new Error(`Host runtime module closure failed: ${message}`); }

async function hostEntrypoint(root) {
  const template = await readFile(path.join(root, ...sourceTemplatePath.split("/")), "utf8");
  const match = /<startarguments>\{\{UED_ROOT\}\}\\current\\([^<]+)<\/startarguments>/u.exec(template);
  if (!match) fail("Windows service template has no canonical Candidate entrypoint");
  const entrypoint = match[1].replaceAll("\\", "/");
  if (!entrypoint.startsWith("scripts/") || path.posix.isAbsolute(entrypoint) || entrypoint.split("/").some((part) => !part || part === "." || part === "..")) fail("Windows service entrypoint escapes the runtime module roots");
  return entrypoint;
}

async function resolveModule(root, importer, specifier, allowMissingModules, missingModulePaths) {
  if (!specifier.startsWith(".")) {
    if (path.isAbsolute(specifier) || path.win32.isAbsolute(specifier) || specifier.startsWith("file:")) fail(`non-Candidate static import: ${specifier}`);
    return null;
  }
  const base = path.resolve(root, path.dirname(importer), specifier);
  if (!inside(root, base)) fail(`static import escapes Candidate root: ${importer} -> ${specifier}`);
  const candidates = path.extname(base) ? [base] : [base, ...moduleExtensions.map((extension) => `${base}${extension}`), ...moduleExtensions.map((extension) => path.join(base, `index${extension}`))];
  for (const candidate of candidates) {
    let details;
    try { details = await lstat(candidate); } catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (details.isSymbolicLink() || !details.isFile() || details.nlink > 1) fail(`static import is not a regular Candidate module: ${toPosix(path.relative(root, candidate))}`);
    const physical = await realpath(candidate);
    if (!inside(root, physical)) fail(`static import resolves outside Candidate root: ${importer} -> ${specifier}`);
    return toPosix(path.relative(root, candidate));
  }
  if (!allowMissingModules) fail(`static import is missing: ${importer} -> ${specifier}`);
  const missing = toPosix(path.relative(root, candidates[0]));
  missingModulePaths.add(missing);
  return missing;
}

export async function deriveHostRuntimeModuleClosure(sourceRoot, { allowMissingModules = false } = {}) {
  const root = await realpath(path.resolve(sourceRoot));
  const entrypoint = await hostEntrypoint(root);
  const pending = [entrypoint];
  const visited = new Set();
  const missingModulePaths = new Set();
  const modules = [];
  const edgeMap = new Map();
  while (pending.length) {
    const relative = pending.pop();
    if (visited.has(relative)) continue;
    visited.add(relative);
    const absolute = path.resolve(root, ...relative.split("/"));
    if (!inside(root, absolute)) fail(`runtime module escapes Candidate root: ${relative}`);
    let details;
    try { details = await lstat(absolute); } catch (error) { if (allowMissingModules && error.code === "ENOENT") { missingModulePaths.add(relative); continue; } throw error; }
    if (details.isSymbolicLink() || !details.isFile() || details.nlink > 1) fail(`runtime module is not a regular Candidate file: ${relative}`);
    if (!relative.startsWith("scripts/") && !relative.startsWith("agent-integration/scripts/")) fail(`runtime module is outside approved code roots: ${relative}`);
    const bytes = await readFile(absolute);
    const source = bytes.toString("utf8");
    const sourceFile = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (sourceFile.parseDiagnostics.length) fail(`runtime module cannot be parsed: ${relative}`);
    const specifiers = [];
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    const module = { path: relative, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length };
    modules.push(module);
    for (const specifier of specifiers) {
      const target = await resolveModule(root, relative, specifier, allowMissingModules, missingModulePaths);
      if (!target) continue;
      const edge = { from: relative, to: target, specifier };
      edgeMap.set(`${edge.from}\0${edge.to}\0${edge.specifier}`, edge);
      pending.push(target);
    }
  }
  modules.sort((left, right) => compareUtf8(left.path, right.path));
  const edges = [...edgeMap.values()].sort((left, right) => compareUtf8(`${left.from}\0${left.to}\0${left.specifier}`, `${right.from}\0${right.to}\0${right.specifier}`));
  const moduleBinding = createHostRuntimeClosureBinding({ entrypoint, modules, edges, sourceCommit: "0".repeat(40), sourceArchiveSha256: "0".repeat(64) });
  return { schemaVersion: 1, entrypoint, graphDigest: moduleBinding.graphDigest, moduleCount: modules.length, modules, edges, missingModulePaths: [...missingModulePaths].sort(compareUtf8) };
}

function assertNoResolutionFallback(environment = {}) {
  if (typeof environment.NODE_PATH === "string" && environment.NODE_PATH.trim()) fail("NODE_PATH is prohibited for a self-contained Candidate");
  if (/(?:^|\s)--(?:require|import|loader)(?:=|\s)/u.test(environment.NODE_OPTIONS || "")) fail("NODE_OPTIONS module-resolution hooks are prohibited");
}

export async function verifyCandidateHostRuntimeClosure({ sourceRoot = null, candidateRoot, runtimeClosure = null, artifactSet = null, sourceCommit = null, sourceArchiveSha256 = null, environment = {} }) {
  assertNoResolutionFallback(environment);
  const candidate = await realpath(path.resolve(candidateRoot));
  const actual = await deriveHostRuntimeModuleClosure(candidate, { allowMissingModules: true });
  const source = sourceRoot ? await deriveHostRuntimeModuleClosure(sourceRoot) : null;
  const expected = source ?? runtimeClosure;
  if (!expected || actual.entrypoint !== expected.entrypoint) fail("expected source-bound closure or Candidate provenance is missing");
  if (runtimeClosure) {
    if (runtimeClosure.schemaVersion !== 1 || runtimeClosure.entrypoint !== expected.entrypoint || runtimeClosure.graphDigest !== expected.graphDigest || runtimeClosure.moduleCount !== expected.moduleCount || JSON.stringify(runtimeClosure.modules) !== JSON.stringify(expected.modules) || JSON.stringify(runtimeClosure.edges) !== JSON.stringify(expected.edges)) fail("Candidate provenance differs from the source-derived closure");
  }
  const expectedModules = new Map(expected.modules.map((module) => [module.path, module]));
  const actualModules = new Map(actual.modules.map((module) => [module.path, module]));
  const missing = [...expectedModules.keys()].filter((relative) => !actualModules.has(relative) || actual.missingModulePaths.includes(relative));
  const unexpected = [...actualModules.keys()].filter((relative) => !expectedModules.has(relative));
  const contentMismatches = [...expectedModules.values()].filter((module) => actualModules.has(module.path) && (module.sha256 !== actualModules.get(module.path).sha256 || module.size !== actualModules.get(module.path).size)).map((module) => module.path);
  const edgeMismatch = JSON.stringify(actual.edges) !== JSON.stringify(expected.edges);
  if (missing.length || unexpected.length || contentMismatches.length || edgeMismatch || actual.missingModulePaths.length) fail(`Candidate closure mismatch: missing=${missing.join(",")}; unexpected=${unexpected.join(",")}; content=${contentMismatches.join(",")}; unresolved=${actual.missingModulePaths.join(",")}`);
  if (runtimeClosure && artifactSet) {
    const { assertHostRuntimeClosureBinding } = await import("./release-runtime-closure-contract.mjs");
    assertHostRuntimeClosureBinding({ runtimeClosure, artifactSet, sourceCommit, sourceArchiveSha256 });
  }
  return { result: "PASS", entrypoint: actual.entrypoint, expectedModuleCount: expected.moduleCount, actualModuleCount: actual.moduleCount, missingModulePaths: [], unexpectedModulePaths: [], contentMismatches: [], graphDigest: actual.graphDigest, sourceTreeFallback: false, nodePathFallback: false };
}
