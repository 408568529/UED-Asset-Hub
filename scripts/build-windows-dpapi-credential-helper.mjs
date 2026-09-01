import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareReleaseNativeDirectories, resolveNativeBuildPlan } from "./native-build-path-contract.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = resolveNativeBuildPlan({ argv: process.argv.slice(2), projectRoot: root, componentDirectory: "windows-dpapi-credential-helper", executableName: "ued-windows-dpapi-credential-helper.exe", protectedRoots: [root] });
if (process.platform !== "win32" || process.arch !== "x64") { console.log("[UED Agent] DPAPI Credential Helper build: NOT RUN (requires Windows x64 MSVC)."); process.exit(0); }
if (plan.mode === "release-native") await prepareReleaseNativeDirectories({ ...plan, expectedCreationRunId: process.env.UED_STAGING_CREATION_RUN_ID, protectedRoots: [root] }); else await mkdir(plan.outputDir, { recursive: true });
await mkdir(plan.tempDir, { recursive: true });
const result = spawnSync("cl.exe", ["/nologo", "/std:c++17", "/EHsc", "/O2", `/Fo${path.join(plan.tempDir, "dpapi.obj")}`, `/Fd${path.join(plan.tempDir, "dpapi.pdb")}`, path.join(root, "native", "windows-dpapi-credential-helper", "ued_windows_dpapi_credential_helper.cpp"), "/link", "/OUT:" + plan.executable, "/PDB:" + path.join(plan.tempDir, "dpapi-link.pdb"), "Crypt32.lib"], { cwd: plan.tempDir, stdio: "inherit", shell: false, env: { ...process.env, TMP: plan.tempDir, TEMP: plan.tempDir } });
if (result.status !== 0) process.exit(result.status || 1);
if (plan.mode === "developer-source-output") { await writeFile(path.join(plan.outputDir, "ued-windows-dpapi-credential-helper.manifest.json"), JSON.stringify({ version: 1, architecture: "x64", sha256: createHash("sha256").update(await readFile(plan.executable)).digest("hex") }, null, 2) + "\n"); await rm(plan.tempDir, { recursive: true, force: true }); }
