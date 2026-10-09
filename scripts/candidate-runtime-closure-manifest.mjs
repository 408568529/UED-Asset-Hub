import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { canonicalJson } from "./release-artifact-tree.mjs";
import { deriveHostRuntimeModuleClosure } from "./host-runtime-module-closure.mjs";

const compareUtf8 = (a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const inside = (root, file) => { const relative = path.relative(root, file); return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)); };
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && canonicalJson(Object.keys(value).sort(compareUtf8)) === canonicalJson([...keys].sort(compareUtf8));
const CHILD_ENTRYPOINT = "scripts/windows-graceful-bootstrap.mjs";
const SHUTDOWN_ENTRYPOINT = "scripts/windows-managed-shutdown-client.mjs";

function fail(message) { throw new Error(`Candidate runtime closure manifest is invalid: ${message}`); }
function graphDigest({ kind, entrypoints, modules, edges }) { return sha256(Buffer.from(canonicalJson({ kind, entrypoints, modules, edges }), "utf8")); }

async function treeIdentity(root, relativeRoot, prefix = "") {
  const base = path.join(root, ...relativeRoot.split("/").filter(Boolean)), files = [];
  async function visit(directory, relative) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = relative ? `${relative}/${entry.name}` : entry.name, absolute = path.join(directory, entry.name), detail = await lstat(absolute);
      if (detail.isSymbolicLink() || (!detail.isDirectory() && detail.nlink > 1)) fail(`runtime artifact contains a link: ${child}`);
      if (detail.isDirectory()) await visit(absolute, child);
      else if (detail.isFile()) files.push({ path: prefix ? `${prefix}/${child}` : child, size: detail.size, sha256: sha256(await readFile(absolute)) });
      else fail(`runtime artifact contains an unsupported entry: ${child}`);
    }
  }
  await visit(base, "");
  files.sort((a, b) => compareUtf8(a.path, b.path));
  return { digest: sha256(Buffer.from(canonicalJson(files), "utf8")), fileCount: files.length };
}

async function deriveStaticGraph(rootPath, kind, entrypoints) {
  const root = await realpath(rootPath), pending = [...entrypoints], visited = new Set(), moduleMap = new Map(), edgeMap = new Map();
  while (pending.length) {
    const relative = pending.pop();
    if (visited.has(relative)) continue;
    visited.add(relative);
    const absolute = path.resolve(root, ...relative.split("/"));
    if (!inside(root, absolute)) fail(`${kind} module escapes root: ${relative}`);
    const details = await lstat(absolute);
    if (!details.isFile() || details.isSymbolicLink() || details.nlink > 1) fail(`${kind} module identity is invalid: ${relative}`);
    const bytes = await readFile(absolute), source = bytes.toString("utf8");
    const sourceFile = ts.createSourceFile(absolute, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (sourceFile.parseDiagnostics.length) fail(`${kind} module cannot be parsed: ${relative}`);
    const module = { path: relative, sha256: sha256(bytes), size: bytes.length };
    moduleMap.set(relative, module);
    const specifiers = [];
    const visit = (node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) {
        if (path.isAbsolute(specifier) || path.win32.isAbsolute(specifier) || specifier.startsWith("file:")) fail(`${kind} has an absolute import: ${relative}`);
        continue;
      }
      const base = path.resolve(root, path.dirname(relative), specifier);
      if (!inside(root, base)) fail(`${kind} import escapes root: ${relative} -> ${specifier}`);
      const candidates = path.extname(base) ? [base] : [base, ...[".mjs", ".js", ".cjs", ".json"].map((ext) => `${base}${ext}`), ...[".mjs", ".js", ".cjs", ".json"].map((ext) => path.join(base, `index${ext}`))];
      let target = null;
      for (const candidate of candidates) {
        try {
          const stat = await lstat(candidate);
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || !inside(root, await realpath(candidate))) fail(`${kind} import target is unsafe: ${relative} -> ${specifier}`);
          target = path.relative(root, candidate).split(path.sep).join("/");
          break;
        } catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      if (!target) fail(`${kind} import is missing: ${relative} -> ${specifier}`);
      edgeMap.set(`${relative}\0${target}\0${specifier}`, { from: relative, to: target, specifier });
      pending.push(target);
    }
  }
  const modules = [...moduleMap.values()].sort((a, b) => compareUtf8(a.path, b.path));
  const edges = [...edgeMap.values()].sort((a, b) => compareUtf8(`${a.from}\0${a.to}\0${a.specifier}`, `${b.from}\0${b.to}\0${b.specifier}`));
  return { kind, entrypoints: [...entrypoints].sort(compareUtf8), modules, edges, moduleCount: modules.length, graphDigest: graphDigest({ kind, entrypoints: [...entrypoints].sort(compareUtf8), modules, edges }) };
}

function sameGraph(a, b) { return canonicalJson(a) === canonicalJson(b); }

export async function deriveCandidateRuntimeClosureSourcePaths(sourceRoot) {
  const root = await realpath(sourceRoot), host = await deriveHostRuntimeModuleClosure(root), child = await deriveStaticGraph(root, "assetHubChild", [CHILD_ENTRYPOINT]), shutdown = await deriveStaticGraph(root, "shutdown", [SHUTDOWN_ENTRYPOINT]);
  return [...new Set([...host.modules, ...child.modules, ...shutdown.modules].map((module) => module.path))].sort(compareUtf8);
}

export async function createCandidateRuntimeClosureManifest({ sourceRoot, candidateRoot, sourceCommit, sourceArchiveSha256, buildId, nextOutput, nodeModules }) {
  if (!/^[a-f0-9]{40}$/u.test(sourceCommit || "") || !/^[a-f0-9]{64}$/u.test(sourceArchiveSha256 || "") || typeof buildId !== "string" || !buildId || !nextOutput?.digest || !nodeModules?.digest) fail("source/build authority is incomplete");
  const source = await realpath(sourceRoot), candidate = await realpath(candidateRoot);
  const sourceHost = await deriveHostRuntimeModuleClosure(source), candidateHost = await deriveHostRuntimeModuleClosure(candidate);
  const sourceChild = await deriveStaticGraph(source, "assetHubChild", [CHILD_ENTRYPOINT]);
  const candidateChild = await deriveStaticGraph(candidate, "assetHubChild", [CHILD_ENTRYPOINT]);
  const sourceShutdown = await deriveStaticGraph(source, "shutdown", [SHUTDOWN_ENTRYPOINT]);
  const candidateShutdown = await deriveStaticGraph(candidate, "shutdown", [SHUTDOWN_ENTRYPOINT]);
  if (sourceHost.graphDigest !== candidateHost.graphDigest || sourceHost.moduleCount !== candidateHost.moduleCount || canonicalJson(sourceHost.modules) !== canonicalJson(candidateHost.modules) || canonicalJson(sourceHost.edges) !== canonicalJson(candidateHost.edges)) fail("Host closure differs from source");
  if (!sameGraph(sourceChild, candidateChild)) fail("Asset Hub child source modules differ from Candidate");
  if (!sameGraph(sourceShutdown, candidateShutdown)) fail("Shutdown source modules differ from Candidate");
  const serverPath = path.join(candidate, "server.js"), serverStat = await lstat(serverPath);
  if (!serverStat.isFile() || serverStat.isSymbolicLink() || serverStat.nlink > 1) fail("generated standalone server.js identity is invalid");
  const serverBytes = await readFile(serverPath), serverModule = { path: "server.js", sha256: sha256(serverBytes), size: serverBytes.length };
  const host = { kind: "host", entrypoints: [sourceHost.entrypoint], modules: sourceHost.modules, edges: sourceHost.edges, moduleCount: sourceHost.moduleCount, graphDigest: sourceHost.graphDigest, sourceCommit, sourceArchiveSha256 };
  const childModules = [...candidateChild.modules, serverModule].sort((a, b) => compareUtf8(a.path, b.path));
  const child = { ...candidateChild, kind: "assetHubChild", entrypoints: [...candidateChild.entrypoints, "server.js"].sort(compareUtf8), modules: childModules, moduleCount: childModules.length, graphDigest: graphDigest({ kind: "assetHubChild", entrypoints: [...candidateChild.entrypoints, "server.js"].sort(compareUtf8), modules: childModules, edges: candidateChild.edges }), sourceCommit, sourceArchiveSha256, generatedServer: { path: "server.js", sha256: serverModule.sha256, size: serverModule.size, buildId, nextOutputDigest: nextOutput.digest }, runtimeArtifacts: { nextOutput: { digest: nextOutput.digest, fileCount: nextOutput.files.length }, nodeModules: { digest: nodeModules.digest, fileCount: nodeModules.files.length } } };
  const shutdown = { ...candidateShutdown, sourceCommit, sourceArchiveSha256 };
  const unionMap = new Map();
  for (const closure of [host, child, shutdown]) for (const module of closure.modules) {
    const previous = unionMap.get(module.path);
    if (previous && (previous.sha256 !== module.sha256 || previous.size !== module.size)) fail(`closure identity conflict: ${module.path}`);
    unionMap.set(module.path, module);
  }
  const unionModules = [...unionMap.values()].sort((a, b) => compareUtf8(a.path, b.path));
  const closures = { host, assetHubChild: child, shutdown };
  const union = { memberCount: unionModules.length, members: unionModules, graphDigest: sha256(Buffer.from(canonicalJson({ closures: Object.fromEntries(Object.entries(closures).map(([name, value]) => [name, value.graphDigest])), members: unionModules }), "utf8")) };
  const identity = { schemaVersion: 1, source: { commit: sourceCommit, archiveSha256: sourceArchiveSha256 }, closures, union };
  return { ...identity, manifestDigest: sha256(Buffer.from(canonicalJson(identity), "utf8")) };
}

export async function assertCandidateRuntimeClosureManifest({ manifest, candidateRoot, artifactSet, sourceCommit, sourceArchiveSha256, runtimeArtifacts }) {
  if (!exactKeys(manifest, ["schemaVersion", "source", "closures", "union", "manifestDigest"]) || !exactKeys(manifest.source, ["commit", "archiveSha256"]) || !exactKeys(manifest.closures, ["host", "assetHubChild", "shutdown"]) || !exactKeys(manifest.union, ["memberCount", "members", "graphDigest"]) || manifest.schemaVersion !== 1 || manifest.source.commit !== sourceCommit || manifest.source.archiveSha256 !== sourceArchiveSha256 || !/^[a-f0-9]{64}$/u.test(manifest.manifestDigest || "")) fail("manifest/source identity mismatch");
  const { manifestDigest, ...identity } = manifest;
  if (sha256(Buffer.from(canonicalJson(identity), "utf8")) !== manifestDigest) fail("manifest digest mismatch");
  const root = await realpath(candidateRoot);
  if (canonicalJson(manifest.closures?.assetHubChild?.runtimeArtifacts) !== canonicalJson(runtimeArtifacts)) fail("child runtime artifact binding mismatch");
  const actualRuntimeArtifacts = { nextOutput: await treeIdentity(root, ".next", ".next"), nodeModules: await treeIdentity(root, "node_modules") };
  if (canonicalJson(actualRuntimeArtifacts) !== canonicalJson(runtimeArtifacts)) fail("Next standalone or node_modules artifact identity mismatch");
  const expectedRoots = { host: ["scripts/start-host.mjs"], assetHubChild: [CHILD_ENTRYPOINT, "server.js"], shutdown: [SHUTDOWN_ENTRYPOINT] };
  for (const [name, entrypoints] of Object.entries(expectedRoots)) {
    const closure = manifest.closures?.[name === "assetHubChild" ? "assetHubChild" : name];
    const closureKeys = name === "assetHubChild" ? ["kind", "entrypoints", "modules", "edges", "moduleCount", "graphDigest", "sourceCommit", "sourceArchiveSha256", "generatedServer", "runtimeArtifacts"] : ["kind", "entrypoints", "modules", "edges", "moduleCount", "graphDigest", "sourceCommit", "sourceArchiveSha256"];
    if (!exactKeys(closure, closureKeys) || closure.kind !== (name === "assetHubChild" ? "assetHubChild" : name) || closure.moduleCount !== closure.modules?.length) fail(`${name} closure shape is invalid`);
    if (name === "assetHubChild" && (!exactKeys(closure.generatedServer, ["path", "sha256", "size", "buildId", "nextOutputDigest"]) || closure.generatedServer.path !== "server.js" || closure.generatedServer.buildId === "" || !/^[a-f0-9]{64}$/u.test(closure.generatedServer.sha256 || "") || !/^[a-f0-9]{64}$/u.test(closure.generatedServer.nextOutputDigest || "") || !exactKeys(closure.runtimeArtifacts, ["nextOutput", "nodeModules"]) || !exactKeys(closure.runtimeArtifacts.nextOutput, ["digest", "fileCount"]) || !exactKeys(closure.runtimeArtifacts.nodeModules, ["digest", "fileCount"]))) fail("Asset Hub child build/runtime artifact binding is invalid");
    if (!closure || closure.sourceCommit !== sourceCommit || closure.sourceArchiveSha256 !== sourceArchiveSha256 || canonicalJson(closure.entrypoints) !== canonicalJson([...entrypoints].sort(compareUtf8))) fail(`${name} closure binding is invalid`);
    const expectedGraphDigest = name === "host" ? sha256(Buffer.from(canonicalJson({ schemaVersion: 1, entrypoint: closure.entrypoints[0], modules: closure.modules, edges: closure.edges }), "utf8")) : graphDigest({ kind: closure.kind, entrypoints: closure.entrypoints, modules: closure.modules, edges: closure.edges });
    if (closure.graphDigest !== expectedGraphDigest) fail(`${name} graph digest mismatch`);
    const files = new Map((artifactSet?.files ?? []).map((file) => [file.path, file]));
    for (const module of closure.modules ?? []) {
      const file = path.resolve(root, ...module.path.split("/"));
      if (!inside(root, file)) fail(`${name} member escapes Candidate: ${module.path}`);
      const detail = await lstat(file);
      if (!detail.isFile() || detail.isSymbolicLink() || detail.nlink > 1 || detail.size !== module.size || sha256(await readFile(file)) !== module.sha256) fail(`${name} member content mismatch: ${module.path}`);
      const artifact = files.get(module.path);
      if (!artifact || artifact.sha256 !== module.sha256 || artifact.size !== module.size) fail(`${name} member is not bound by Candidate artifact set: ${module.path}`);
    }
    const actual = name === "host" ? await deriveHostRuntimeModuleClosure(root) : await deriveStaticGraph(root, name === "assetHubChild" ? "assetHubChild" : "shutdown", [name === "assetHubChild" ? CHILD_ENTRYPOINT : SHUTDOWN_ENTRYPOINT]);
    const actualModules = name === "assetHubChild" ? [...actual.modules, { path: closure.generatedServer.path, sha256: closure.generatedServer.sha256, size: closure.generatedServer.size }].sort((a, b) => compareUtf8(a.path, b.path)) : actual.modules;
    if (canonicalJson(actualModules) !== canonicalJson(closure.modules) || canonicalJson(actual.edges) !== canonicalJson(closure.edges)) fail(`${name} dependency graph changed`);
  }
  const unionMap = new Map();
  for (const closure of Object.values(manifest.closures)) for (const module of closure.modules) unionMap.set(module.path, module);
  const members = [...unionMap.values()].sort((a, b) => compareUtf8(a.path, b.path));
  if (manifest.union?.memberCount !== members.length || canonicalJson(manifest.union.members) !== canonicalJson(members) || manifest.union.graphDigest !== sha256(Buffer.from(canonicalJson({ closures: Object.fromEntries(Object.entries(manifest.closures).map(([name, value]) => [name, value.graphDigest])), members }), "utf8"))) fail("union closure mismatch");
  return { result: "PASS", hostCount: manifest.closures.host.moduleCount, childCount: manifest.closures.assetHubChild.moduleCount, shutdownCount: manifest.closures.shutdown.moduleCount, unionCount: members.length, manifestDigest };
}
