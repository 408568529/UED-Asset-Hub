import { createHash } from "node:crypto";
import path from "node:path";
import { canonicalJson, normalizeArtifactPath } from "./release-artifact-tree.mjs";

const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && canonicalJson(Object.keys(value).sort(compareUtf8)) === canonicalJson([...keys].sort(compareUtf8));

function fail(message) { throw new Error(`Host runtime closure contract is invalid: ${message}`); }

export function createHostRuntimeClosureBinding({ entrypoint, modules, edges, sourceCommit, sourceArchiveSha256 }) {
  const orderedModules = [...modules].sort((left, right) => compareUtf8(left.path, right.path));
  const orderedEdges = [...edges].sort((left, right) => compareUtf8(`${left.from}\0${left.to}\0${left.specifier}`, `${right.from}\0${right.to}\0${right.specifier}`));
  const identity = { schemaVersion: 1, entrypoint, modules: orderedModules, edges: orderedEdges };
  return { ...identity, graphDigest: sha256(Buffer.from(canonicalJson(identity), "utf8")), moduleCount: orderedModules.length, sourceCommit, sourceArchiveSha256 };
}

export function assertHostRuntimeClosureBinding({ runtimeClosure, artifactSet, sourceCommit, sourceArchiveSha256 }) {
  if (!exactKeys(runtimeClosure, ["schemaVersion", "entrypoint", "graphDigest", "moduleCount", "modules", "edges", "sourceCommit", "sourceArchiveSha256"]) || runtimeClosure.schemaVersion !== 1 || !Number.isSafeInteger(runtimeClosure.moduleCount) || !Array.isArray(runtimeClosure.modules) || runtimeClosure.moduleCount !== runtimeClosure.modules.length || !Array.isArray(runtimeClosure.edges)) fail("manifest shape");
  if (typeof runtimeClosure.entrypoint !== "string" || normalizeArtifactPath(runtimeClosure.entrypoint) !== runtimeClosure.entrypoint || !runtimeClosure.modules.some((module) => module?.path === runtimeClosure.entrypoint)) fail("entrypoint binding");
  if (!/^[a-f0-9]{64}$/u.test(runtimeClosure.graphDigest || "") || !/^[a-f0-9]{40}$/u.test(runtimeClosure.sourceCommit || "") || !/^[a-f0-9]{64}$/u.test(runtimeClosure.sourceArchiveSha256 || "") || runtimeClosure.sourceCommit !== sourceCommit || runtimeClosure.sourceArchiveSha256 !== sourceArchiveSha256) fail("source identity binding");
  const modulePaths = new Set();
  for (const module of runtimeClosure.modules) {
    if (!exactKeys(module, ["path", "sha256", "size"]) || typeof module.path !== "string" || normalizeArtifactPath(module.path) !== module.path || !/^(?:scripts|agent-integration\/scripts)\//u.test(module.path) || !/^[a-f0-9]{64}$/u.test(module.sha256 || "") || !Number.isSafeInteger(module.size) || module.size < 0 || modulePaths.has(module.path)) fail("module identity");
    modulePaths.add(module.path);
  }
  const edgeKeys = new Set();
  for (const edge of runtimeClosure.edges) {
    if (!exactKeys(edge, ["from", "to", "specifier"]) || !modulePaths.has(edge.from) || !modulePaths.has(edge.to) || typeof edge.specifier !== "string" || !edge.specifier.startsWith(".")) fail("module edge");
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(edge.from), edge.specifier));
    if (resolved !== edge.to && !edge.to.startsWith(`${resolved}.`) && !edge.to.startsWith(`${resolved}/index.`)) fail("module edge target");
    const key = `${edge.from}\0${edge.to}\0${edge.specifier}`;
    if (edgeKeys.has(key)) fail("duplicate module edge");
    edgeKeys.add(key);
  }
  const identity = { schemaVersion: runtimeClosure.schemaVersion, entrypoint: runtimeClosure.entrypoint, modules: runtimeClosure.modules, edges: runtimeClosure.edges };
  if (sha256(Buffer.from(canonicalJson(identity), "utf8")) !== runtimeClosure.graphDigest) fail("graph digest");
  if (artifactSet) {
    const files = new Map(artifactSet.files.map((file) => [file.path, file]));
    for (const module of runtimeClosure.modules) {
      const artifact = files.get(module.path);
      if (!artifact || artifact.sha256 !== module.sha256 || artifact.size !== module.size) fail(`Candidate artifact omits or changes ${module.path}`);
    }
  }
  return runtimeClosure;
}
