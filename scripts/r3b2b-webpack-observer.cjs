"use strict";

// Diagnostic-only observer. Its instrumented builds are never release-pass evidence.
const { createHash } = require("node:crypto");
const { mkdir, open, rename } = require("node:fs/promises");
const path = require("node:path");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const scalar = (value) => value === undefined ? null : value;

function configured() {
  const evidenceDir = process.env.UED_R3B2B_OBSERVER_DIR;
  const label = process.env.UED_R3B2B_OBSERVER_LABEL;
  if (!evidenceDir || !path.isAbsolute(evidenceDir) || !/^[ab]$/.test(label || "")) throw new Error("R3B2B observer requires an absolute evidence directory and A/B label.");
  return { evidenceDir, label };
}

function assetIdentity(compilation, stage) {
  const assets = compilation.getAssets().filter(({ name }) => /(?:main-app|not-found).*\.js$/i.test(name)).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return assets.map(({ name, source }) => {
    const bytes = source.buffer();
    return { name, size: bytes.length, sha256: sha256(bytes), stage };
  });
}

async function writeEvidence(directory, name, value) {
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, name);
  const partial = `${target}.partial.${process.pid}`;
  const handle = await open(partial, "wx");
  try { await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  await rename(partial, target);
}

function moduleInfo(module, compilation, index) {
  const identifier = typeof module.identifier === "function" ? module.identifier() : null;
  const incoming = [...compilation.moduleGraph.getIncomingConnections(module)].map((connection) => ({
    originIdentifier: typeof connection.originModule?.identifier === "function" ? connection.originModule.identifier() : null,
    dependencyType: connection.dependency?.type ?? null,
    request: connection.dependency?.request ?? null,
  }));
  return {
    key: index,
    identifier,
    readableIdentifier: typeof module.readableIdentifier === "function" ? module.readableIdentifier(compilation.requestShortener) : null,
    resource: typeof module.resource === "string" ? module.resource : null,
    type: scalar(module.type),
    layer: scalar(module.layer),
    id: scalar(compilation.chunkGraph.getModuleId(module)),
    incoming,
  };
}

function attachWebpackObserver({ webpack, compiler, config }) {
  const { evidenceDir, label } = configured();
  if (compiler.webpack !== webpack) throw new Error("R3B2B export fidelity failure: compiler webpack reference differs.");
  const hooks = compiler.hooks;
  if (!hooks?.thisCompilation || !hooks?.done) throw new Error("R3B2B approved compiler hook contract is unavailable.");
  let output;
  hooks.thisCompilation.tap("UedR3b2bWebpackObserver", (compilation) => {
    const required = ["beforeModuleIds", "afterOptimizeModuleIds", "afterOptimizeChunkIds", "processAssets"];
    if (required.some((name) => !compilation.hooks?.[name])) throw new Error("R3B2B approved compilation hook contract is unavailable.");
    const seen = new WeakMap();
    let sequence = 0;
    const preModules = [];
    const postModules = [];
    let chunks = [];
    let preOptimizeSizeAssets = [];
    let postOptimizeSizeAssets = [];
    compilation.hooks.beforeModuleIds.tap("UedR3b2bWebpackObserver", (modules) => {
      for (const module of modules) { const key = sequence++; seen.set(module, key); preModules.push(moduleInfo(module, compilation, key)); }
    });
    compilation.hooks.afterOptimizeModuleIds.tap("UedR3b2bWebpackObserver", (modules) => {
      for (const module of modules) { const key = seen.get(module); if (key !== undefined) postModules.push(moduleInfo(module, compilation, key)); }
    });
    compilation.hooks.afterOptimizeChunkIds.tap("UedR3b2bWebpackObserver", () => {
      chunks = [...compilation.chunks].map((chunk) => ({
        name: scalar(chunk.name), id: scalar(chunk.id), ids: [...(chunk.ids || [])].map(String).sort(), runtime: scalar(chunk.runtime), files: [...chunk.files].map(String).sort(),
        modules: [...compilation.chunkGraph.getChunkModulesIterable(chunk)].map((module) => ({ key: seen.get(module) ?? null, identifier: typeof module.identifier === "function" ? module.identifier() : null, id: scalar(compilation.chunkGraph.getModuleId(module)) })),
        runtimeModules: [...compilation.chunkGraph.getChunkRuntimeModulesIterable(chunk)].map((module) => ({ identifier: typeof module.identifier === "function" ? module.identifier() : null, id: scalar(compilation.chunkGraph.getModuleId(module)) })),
      })).filter((chunk) => /main-app|not-found/i.test(`${chunk.name || ""} ${chunk.files.join(" ")}`));
    });
    const optimizeSize = webpack.Compilation?.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE;
    if (!Number.isInteger(optimizeSize)) throw new Error("R3B2B asset-stage contract is unavailable.");
    compilation.hooks.processAssets.tap({ name: "UedR3b2bWebpackObserverPreOptimizeSize", stage: optimizeSize - 1 }, () => { preOptimizeSizeAssets = assetIdentity(compilation, "before-optimize-size"); });
    compilation.hooks.processAssets.tap({ name: "UedR3b2bWebpackObserverPostOptimizeSize", stage: optimizeSize + 1 }, () => { postOptimizeSizeAssets = assetIdentity(compilation, "after-optimize-size"); });
    hooks.done.tapPromise("UedR3b2bWebpackObserver", async (stats) => {
      output = {
        schemaVersion: 1, observationOnly: true, diagnosticBuildsAreNotReleaseEvidence: true,
        exportIdentity: { compilerWebpackStrict: compiler.webpack === webpack },
        compilation: { pid: process.pid, ppid: process.ppid, label, compilerName: scalar(config.name), compilerTarget: scalar(config.target), compilerContext: scalar(compiler.context), webpackVersion: scalar(webpack.version), isNextWorker: process.env.IS_NEXT_WORKER === "true", isNextBuildWorker: process.env.NEXT_PRIVATE_BUILD_WORKER === "1", compilationMarker: sha256(`${config.name || ""}:${preModules.length}:${postModules.length}`), hasErrors: stats.hasErrors() },
        preModuleIds: preModules, postModuleIds: postModules, chunkMembership: chunks,
        moduleIds: { before: preModules, after: postModules }, chunks, assets: { beforeOptimizeSize: preOptimizeSizeAssets, afterOptimizeSize: postOptimizeSizeAssets },
      };
      await writeEvidence(evidenceDir, `webpack-observer-${label}-${config.name || "unknown"}-pid${process.pid}.json`, output);
    });
  });
}

module.exports = { attachWebpackObserver };
