import { isDeepStrictEqual } from "node:util";

export const observerSchema = Object.freeze({ version: 1, moduleId: "id", moduleIdentifier: "identifier", chunkId: "id", membership: "chunkMembership[].modules", runtimeModules: "chunkMembership[].runtimeModules", assetStages: ["beforeOptimizeSize", "afterOptimizeSize"] });
const fail = (message) => { throw new Error(`R3 observer schema: ${message}`); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string";
const nullableText = (value) => value === null || text(value);
const id = (value) => value === null || text(value) || Number.isSafeInteger(value) && value >= 0;
function fields(value, contract, location) {
  if (!object(value)) fail(`${location} must be an object`);
  for (const [key, check] of Object.entries(contract)) if (!Object.hasOwn(value, key) || !check(value[key])) fail(`${location}.${key} missing or wrong type`);
}
function array(value, check, location) {
  if (!Array.isArray(value)) fail(`${location} must be an array`);
  value.forEach((item, index) => check(item, `${location}[${index}]`));
}
const member = (value, location) => fields(value, { identifier: text, id }, location);
function moduleRecord(value, location) {
  fields(value, { key: Number.isSafeInteger, identifier: text, readableIdentifier: nullableText, resource: nullableText, type: nullableText, layer: nullableText, id, incoming: Array.isArray }, location);
  array(value.incoming, (edge, where) => fields(edge, { originIdentifier: nullableText, dependencyType: nullableText, request: nullableText }, where), `${location}.incoming`);
}
export function validateObserverEntry(entry) {
  fields(entry, { schemaVersion: (v) => v === 1, observationOnly: (v) => v === true, diagnosticBuildsAreNotReleaseEvidence: (v) => v === true, compilation: object, exportIdentity: object, moduleIds: object, assets: object }, "entry");
  fields(entry.exportIdentity, { compilerWebpackStrict: (v) => v === true }, "exportIdentity");
  fields(entry.compilation, { pid: Number.isSafeInteger, ppid: Number.isSafeInteger, label: (v) => v === "a" || v === "b", compilerName: text, compilerTarget: (v) => nullableText(v) || Array.isArray(v) && v.every(text), compilerContext: text, webpackVersion: text, isNextWorker: (v) => typeof v === "boolean", isNextBuildWorker: (v) => typeof v === "boolean", compilationMarker: text, hasErrors: (v) => v === false }, "compilation");
  array(entry.preModuleIds, moduleRecord, "preModuleIds");
  array(entry.postModuleIds, moduleRecord, "postModuleIds");
  array(entry.chunkMembership, (chunk, location) => {
    fields(chunk, { name: nullableText, id, ids: (v) => Array.isArray(v) && v.every(text), runtime: (v) => nullableText(v) || object(v) && Object.keys(v).length === 0, files: (v) => Array.isArray(v) && v.every(text), modules: Array.isArray, runtimeModules: Array.isArray }, location);
    array(chunk.modules, (m, where) => { member(m, where); fields(m, { key: (v) => v === null || Number.isSafeInteger(v) }, where); }, `${location}.modules`);
    array(chunk.runtimeModules, member, `${location}.runtimeModules`);
  }, "chunkMembership");
  for (const [key, stage] of [["beforeOptimizeSize", "before-optimize-size"], ["afterOptimizeSize", "after-optimize-size"]]) array(entry.assets[key], (asset, location) => fields(asset, { name: text, size: (v) => Number.isSafeInteger(v) && v >= 0, sha256: (v) => text(v) && /^[a-f0-9]{64}$/.test(v), stage: (v) => v === stage }, location), `assets.${key}`);
  if (!isDeepStrictEqual(entry.moduleIds.before, entry.preModuleIds) || !isDeepStrictEqual(entry.moduleIds.after, entry.postModuleIds) || !isDeepStrictEqual(entry.chunks, entry.chunkMembership)) fail("v1 duplicate projections disagree");
  return entry;
}

// Diagnostic comparison only: never rewrite the real identifier used by Webpack.
export function logicalIdentifier(identifier, context) {
  let result = identifier;
  const escaped = JSON.stringify(context).slice(1, -1);
  const variants = new Set([context, context.replaceAll("\\", "/"), escaped, encodeURIComponent(escaped), encodeURIComponent(context), encodeURIComponent(encodeURIComponent(context))]);
  for (const variant of [...variants].sort((a, b) => b.length - a.length)) if (variant) result = result.split(variant).join("<WORKSPACE>");
  return result;
}
function indexModules(entry) {
  const index = new Map();
  const runtimeWithoutAssignedId = [];
  for (const module of entry.postModuleIds) {
    const key = logicalIdentifier(module.identifier, entry.compilation.compilerContext);
    // Runtime modules can repeat by chunk and have no assigned module ID in v1.
    // Do not collapse these into a fabricated identifier-to-ID mapping.
    if (module.type === "runtime" && module.id === null) { runtimeWithoutAssignedId.push({ identifier: key, key: module.key, classification: "RUNTIME_MODULE_WITHOUT_ASSIGNED_ID" }); continue; }
    if (index.has(key)) fail(`duplicate normalized identifier in ${entry.compilation.compilerName}: ${key}`);
    index.set(key, module);
  }
  if (index.size && [...index.values()].every((module) => module.id === null)) fail("all-null module-ID mapping");
  return { index, runtimeWithoutAssignedId };
}
export function compareObserverModules(entriesA, entriesB) {
  const byCompiler = (entries) => {
    const map = new Map();
    for (const entry of entries) {
      validateObserverEntry(entry);
      const name = entry.compilation.compilerName;
      if (map.has(name)) fail(`duplicate compiler ${name}`);
      map.set(name, entry);
    }
    if (!map.size) fail("no compiler evidence");
    return map;
  };
  const a = byCompiler(entriesA), b = byCompiler(entriesB);
  if (a.size !== b.size || [...a.keys()].some((name) => !b.has(name))) fail("compiler set mismatch");
  const compilers = [];
  for (const [name, left] of a) {
    const right = b.get(name), indexedA = indexModules(left), indexedB = indexModules(right), x = indexedA.index, y = indexedB.index;
    const mappings = [...x].filter(([key]) => y.has(key)).map(([identifier, module]) => ({ identifier, rawIdentifierA: module.identifier, rawIdentifierB: y.get(identifier).identifier, a: module.id, b: y.get(identifier).id }));
    if (x.size && !mappings.length) fail(`no corresponding identifiers in ${name}`);
    const onlyA = [...x.keys()].filter((key) => !y.has(key)), onlyB = [...y.keys()].filter((key) => !x.has(key));
    const order = (entry) => entry.preModuleIds.map((module) => logicalIdentifier(module.identifier, entry.compilation.compilerContext));
    compilers.push({ compiler: name, moduleCountA: left.postModuleIds.length, moduleCountB: right.postModuleIds.length, runtimeWithoutAssignedId: { a: indexedA.runtimeWithoutAssignedId, b: indexedB.runtimeWithoutAssignedId }, onlyA, onlyB, normalizedSetEqual: !onlyA.length && !onlyB.length, recordedPreOrderEqual: isDeepStrictEqual(order(left), order(right)), mappings, differences: mappings.filter((module) => module.a !== module.b) });
  }
  return { schemaVersion: 1, moduleIdField: "id", observationOnly: true, normalizationIsNotWebpackInputEquality: true, compilers };
}
