import { captureNativeBuild } from "./native-build-capture.mjs";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { prepareReleaseNativeDirectories, resolveNativeBuildPlan } from "./native-build-path-contract.mjs";
import { getNativeComponentDefinition, writeNativeComponentManifest } from "./native-artifact-contract.mjs";

const root = path.resolve(import.meta.dirname, "..");
const component = getNativeComponentDefinition("job-helper");
const source = path.join(root, ...component.sourceRelativePath.split("/"));
const plan = resolveNativeBuildPlan({ argv: process.argv.slice(2), projectRoot: root, componentDefinition: component, protectedRoots: [root] });

if (process.platform !== "win32" || process.arch !== "x64") {
  if (plan.mode === "release-native") throw new Error("Release-native capture requires Windows x64 MSVC");
  console.log("[UED Agent] Windows Job Helper build: NOT RUN (requires Windows x64 MSVC).");
  process.exit(0);
}

await access(source);
if (plan.mode === "release-native") await prepareReleaseNativeDirectories({ ...plan, expectedCreationRunId: process.env.UED_STAGING_CREATION_RUN_ID, protectedRoots: [root] }); else await mkdir(plan.outputDir, { recursive: true });
await mkdir(plan.tempDir, { recursive: true });
let capture;
if (plan.mode === "release-native") capture = await captureNativeBuild({ plan, sourceRoot: root });
else {
const compiler = spawn("cl.exe", ["/nologo", "/std:c++17", "/EHsc", "/O2", "/MT", `/Fo${path.join(plan.tempDir, "job-helper.obj")}`, `/Fd${path.join(plan.tempDir, "job-helper.pdb")}`, `/Fe:${plan.executable}`, source], { cwd: plan.tempDir, stdio: "inherit", shell: false, env: { ...process.env, TMP: plan.tempDir, TEMP: plan.tempDir } });
const code = await new Promise((resolve) => compiler.once("exit", resolve));
if (code !== 0) throw new Error("Windows Job Helper build failed. Run from an x64 Native Tools command prompt.");
}
if (plan.mode === "release-native") await writeNativeComponentManifest({ definition: component, outputDir: plan.outputDir, sourceRoot: root, assetHubCommit: plan.assetHubCommit, toolchain: plan.componentToolchain, inspection: capture.inspection });
else { const sha256 = createHash("sha256").update(await readFile(plan.executable)).digest("hex"); await writeFile(path.join(plan.outputDir, "ued-windows-job-helper.manifest.json"), JSON.stringify({ version: 1, architecture: "x64", sha256, binary: path.basename(plan.executable) }, null, 2) + "\n"); await rm(plan.tempDir, { recursive: true, force: true }); }
console.log(`[UED Agent] Windows Job Helper built: ${plan.executable}`);
