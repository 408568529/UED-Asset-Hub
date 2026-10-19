import { captureNativeBuild } from "./native-build-capture.mjs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareReleaseNativeDirectories, resolveNativeBuildPlan } from "./native-build-path-contract.mjs";
import { getNativeComponentDefinition, writeNativeComponentManifest } from "./native-artifact-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const component = getNativeComponentDefinition("pipe-security-adapter");
const source = path.join(root, ...component.sourceRelativePath.split("/"));
const plan = resolveNativeBuildPlan({ argv: process.argv.slice(2), projectRoot: root, componentDefinition: component, protectedRoots: [root] });

if (process.platform !== "win32" || process.arch !== "x64") {
  if (plan.mode === "release-native") throw new Error("Release-native capture requires Windows x64 MSVC");
  console.log("[UED Agent] Windows Pipe Security Adapter build: NOT RUN (requires Windows x64 MSVC).");
  process.exit(0);
}

if (plan.mode === "release-native") await prepareReleaseNativeDirectories({ ...plan, expectedCreationRunId: process.env.UED_STAGING_CREATION_RUN_ID, protectedRoots: [root] }); else await mkdir(plan.outputDir, { recursive: true });
await mkdir(plan.tempDir, { recursive: true });
let capture;
if (plan.mode === "release-native") capture = await captureNativeBuild({ plan, sourceRoot: root });
else {
const compiler = process.env.CXX || "cl.exe";
const result = spawnSync(compiler, ["/nologo", "/std:c++17", "/EHsc", "/O2", "/MT", "/W4", `/Fo${path.join(plan.tempDir, "pipe-security.obj")}`, `/Fd${path.join(plan.tempDir, "pipe-security.pdb")}`, source, "/link", "/OUT:" + plan.executable, "/PDB:" + path.join(plan.tempDir, "pipe-security-link.pdb"), "Advapi32.lib"], { cwd: plan.tempDir, stdio: "inherit", shell: false, env: { ...process.env, TMP: plan.tempDir, TEMP: plan.tempDir } });
if (result.status !== 0) process.exit(result.status || 1);
const executable = await readFile(plan.executable);
const sha256 = createHash("sha256").update(executable).digest("hex");
}
if (plan.mode === "release-native") await writeNativeComponentManifest({ definition: component, outputDir: plan.outputDir, sourceRoot: root, assetHubCommit: plan.assetHubCommit, toolchain: plan.componentToolchain, inspection: capture.inspection });
else { await writeFile(path.join(plan.outputDir, "ued-windows-pipe-security-adapter.manifest.json"), `${JSON.stringify({ version: 1, architecture: "x64", sha256: createHash("sha256").update(await readFile(plan.executable)).digest("hex") }, null, 2)}\n`, "utf8"); await rm(plan.tempDir, { recursive: true, force: true }); }
console.log(`[UED Agent] Built Windows Pipe Security Adapter: ${plan.executable}`);
