import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createInternalReleaseManifest, deriveInternalRuntimeModuleClosure, verifyInternalReleaseManifest } from "./internal-release-contract.mjs";
import { validateInternalRuntimeEnvironment } from "./internal-release-preflight.mjs";
import { resolveHostPorts } from "./runtime-ports.mjs";

const { default: nextConfig } = await import("../next.config.ts");
assert.equal(nextConfig.experimental?.isrFlushToDisk, false, "Runtime page caches must not change the immutable release tree.");

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ued-internal-release-contract-"));
const payloadRoot = path.join(temporaryRoot, "payload");
const sourceCommit = "e7944e8a6c8d241f8be3f1c31131e3e68a62afb2";
const sourceTree = "10ef814fa0c12fb1f08de9018026ce78feb48728";

try {
  await Promise.all([
    mkdir(path.join(payloadRoot, "scripts"), { recursive: true }),
    mkdir(path.join(payloadRoot, "agent-integration", "scripts"), { recursive: true }),
    mkdir(path.join(payloadRoot, ".next", "static"), { recursive: true }),
    mkdir(path.join(payloadRoot, "node_modules", "fixture"), { recursive: true })
  ]);
  await Promise.all([
    writeFile(path.join(payloadRoot, "server.js"), "process.exit(0);\n"),
    writeFile(path.join(payloadRoot, "scripts", "start-host.mjs"), "export {};\n"),
    writeFile(path.join(payloadRoot, "scripts", "windows-graceful-bootstrap.mjs"), "export {};\n"),
    writeFile(path.join(payloadRoot, "scripts", "windows-managed-shutdown-client.mjs"), "export {};\n"),
    writeFile(path.join(payloadRoot, "scripts", "internal-release-preflight.mjs"), "export {};\n"),
    writeFile(path.join(payloadRoot, "agent-integration", "scripts", "start-agent-proxy.mjs"), "export {};\n"),
    writeFile(path.join(payloadRoot, "agent-integration", "scripts", "start-knowledge-gateway-mcp.mjs"), "export {};\n"),
    writeFile(path.join(payloadRoot, "node_modules", "fixture", "index.d.ts"), "export type Fixture = string;\n")
  ]);
  const manifest = await createInternalReleaseManifest({
    payloadRoot,
    sourceCommit,
    sourceTree,
    releaseVersion: "internal-0.1.0-e7944e8a6c8d",
    builtAtUtc: new Date().toISOString(),
    build: { node: "v22.23.2", npm: "10.9.8", platform: "win32-x64", visualStudio: "17.0", msvcCompiler: "19.0" },
    dsh: { version: "0.1.1-rc.2", packageManager: "pnpm@11.7.0", license: "MIT", commit: "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e", tree: "53915efe4e2126cc7779b73dfc8a3bcec5318c44" }
  });
  await writeFile(path.join(payloadRoot, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await verifyInternalReleaseManifest({ payloadRoot });
  const standaloneVerifier = path.join(temporaryRoot, "internal-release-contract.mjs");
  await copyFile(new URL("./internal-release-contract.mjs", import.meta.url), standaloneVerifier);
  execFileSync(process.execPath, [standaloneVerifier, "verify", "--root", payloadRoot], { stdio: "pipe" });

  const manifestPath = path.join(payloadRoot, "release-manifest.json");
  const savedManifest = `${JSON.stringify(manifest, null, 2)}\n`;
  await rm(manifestPath);
  await symlink(path.join(temporaryRoot, "missing-manifest-target"), manifestPath);
  await assert.rejects(() => verifyInternalReleaseManifest({ payloadRoot }), /regular, unlinked file/);
  await rm(manifestPath);
  await writeFile(manifestPath, savedManifest);

  const corruptedManifest = structuredClone(manifest);
  corruptedManifest.files.push({ path: "../outside.txt", size: 1, sha256: "0".repeat(64) });
  await assert.rejects(() => verifyInternalReleaseManifest({ payloadRoot, manifest: corruptedManifest }), /unsafe relative path/);

  const sourceFile = path.join(payloadRoot, "scripts", "start-host.mjs");
  await writeFile(sourceFile, "export const tampered = true;\n");
  await assert.rejects(() => verifyInternalReleaseManifest({ payloadRoot }), /differ from manifest/);

  await rm(sourceFile);
  await symlink(path.join(temporaryRoot, "missing-target"), sourceFile);
  await assert.rejects(() => verifyInternalReleaseManifest({ payloadRoot }), /links are not allowed/);

  for (const suffix of ["a", "b"]) {
    const roots = Object.fromEntries(["data", "media", "agent", "hub-runtime", "dsh", "dsh-runtime"].map((name) => [name, path.join(temporaryRoot, `root-${suffix}-${name}`)]));
    await Promise.all(Object.values(roots).map((directory) => mkdir(directory, { recursive: true })));
    const environment = {
      DATA_DIR: roots.data,
      TRAINING_MEDIA_DIR: roots.media,
      AGENT_RUNTIME_DIR: roots.agent,
      ASSET_HUB_RUNTIME_DIR: roots["hub-runtime"],
      DSH_SOURCE_DIR: roots.dsh,
      DSH_RUNTIME_SOURCE_DIR: roots["dsh-runtime"]
    };
    assert.equal((await validateInternalRuntimeEnvironment(environment, payloadRoot)).result, "PASS");
    await assert.rejects(() => validateInternalRuntimeEnvironment({ ...environment, AGENT_RUNTIME_DIR: roots.data }, payloadRoot), /must be separate/);
    await assert.rejects(() => validateInternalRuntimeEnvironment({ ...environment, TRAINING_MEDIA_DIR: undefined }, payloadRoot), /missing required TRAINING_MEDIA_DIR/);
  }
  assert.equal(resolveHostPorts({}).dsh, 3080, "existing default DSH port stays compatible");
  assert.equal(resolveHostPorts({ DSH_PORT: "3180", AGENT_PROXY_PORT: "3181", HOST_PORT: "3182", HOST_INTERNAL_PORT: "3183", KNOWLEDGE_GATEWAY_MCP_PORT: "3184" }).dsh, 3180);
  assert.throws(() => resolveHostPorts({ DSH_PORT: "3180", AGENT_PROXY_PORT: "3180" }), /must be unique/);
  assert.throws(() => resolveHostPorts({ DSH_PORT: "70000" }), /valid TCP port/);
  const analysisRoot = path.join(temporaryRoot, "analysis");
  await mkdir(path.join(analysisRoot, "scripts"), { recursive: true });
  await writeFile(path.join(analysisRoot, "scripts", "entry.mjs"), [
    'const patch = \'import { policy } from "./generated-policy.mjs";\';',
    '// import "./comment-only.mjs";',
    'import "./side-effect.mjs";',
    'export { value } from "./exported.mjs";',
    'const load = () => import("./lazy.mjs");'
  ].join("\n"));
  for (const name of ["side-effect.mjs", "exported.mjs", "lazy.mjs"]) await writeFile(path.join(analysisRoot, "scripts", name), "export const value = true;\n");
  assert.deepEqual(await deriveInternalRuntimeModuleClosure(analysisRoot, ["scripts/entry.mjs"]), ["scripts/entry.mjs", "scripts/exported.mjs", "scripts/lazy.mjs", "scripts/side-effect.mjs"]);
  await rm(path.join(analysisRoot, "scripts", "lazy.mjs"));
  await assert.rejects(() => deriveInternalRuntimeModuleClosure(analysisRoot, ["scripts/entry.mjs"]), /runtime import is missing/);
  const closure = await deriveInternalRuntimeModuleClosure(path.resolve("."), [
    "scripts/start-host.mjs",
    "scripts/windows-graceful-bootstrap.mjs",
    "scripts/windows-managed-shutdown-client.mjs",
    "agent-integration/scripts/start-agent-proxy.mjs",
    "agent-integration/scripts/start-knowledge-gateway-mcp.mjs"
  ]);
  assert.ok(closure.includes("scripts/runtime-ports.mjs"));
  assert.ok(closure.includes("scripts/windows-graceful-bootstrap.mjs"));
  assert.ok(closure.includes("scripts/windows-graceful-pipe.mjs"));
  assert.ok(closure.includes("scripts/windows-managed-shutdown-client.mjs"));
  assert.ok(closure.includes("agent-integration/scripts/start-knowledge-gateway-mcp.mjs"));
  assert.ok(closure.includes("agent-integration/scripts/haldur-reading-policy.mjs"));
  assert.ok(closure.every((file) => file.startsWith("scripts/") || file.startsWith("agent-integration/scripts/")));
  console.log("[internal-release] manifest identity, file hashes, path traversal, tamper and link checks passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
