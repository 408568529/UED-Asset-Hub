import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, readFile, writeFile, realpath, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { calculateNativeSourceInputs, nativeSourceIdentity } from "./native-artifact-contract.mjs";
import { calculateCompleteByteTreeInventory } from "./release-byte-comparison.mjs";
import { validateFrozenSourceManifest } from "./frozen-source-authority.mjs";
import { createNativeBuildReceipt, nativeBuildReceiptBytes, inspectNativeExecutable, nativeComponentArgv } from "./native-build-authority.mjs";
const exec = promisify(execFile);
async function fresh(file) { try { await lstat(file); } catch (error) { if (error.code === "ENOENT") return; throw error; } throw new Error("Native output already exists: " + file); }
const contained = (root, file) => { const rel = path.relative(root, file); return rel && !rel.startsWith("..") && !path.isAbsolute(rel); };
export async function captureNativeBuild({ plan, sourceRoot }) {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Actual Native capture requires Windows x64 MSVC");
  for (const name of ["compilerPath", "linkerPath", "sdkRoot", "sourceArchive", "sourceSnapshotManifest", "buildReceiptDir"]) if (!path.win32.isAbsolute(plan[name] || "")) throw new Error("Native capture requires absolute " + name);
  for (const name of ["experimentId", "executionRunId"]) if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(plan[name] || "")) throw new Error("Native capture requires " + name);
  if (!contained(plan.stagingRoot, plan.buildReceiptDir) || contained(plan.outputDir, plan.buildReceiptDir) || contained(plan.tempDir, plan.buildReceiptDir)) throw new Error("Native receipt must remain external to outputs/temp");
  const compiler = await realpath(plan.compilerPath), linker = await realpath(plan.linkerPath), sdk = await realpath(plan.sdkRoot);
  if (path.basename(compiler).toLowerCase() !== "cl.exe" || path.basename(linker).toLowerCase() !== "link.exe" || path.dirname(linker) !== path.dirname(compiler)) throw new Error("Native actual compiler/linker selection");
  const source = validateFrozenSourceManifest(await readFile(plan.sourceSnapshotManifest), await readFile(plan.sourceArchive));
  if (source.projection.sourceCommit !== plan.assetHubCommit) throw new Error("Native approved source commit");
  const inputs = await calculateNativeSourceInputs(sourceRoot);
  for (const input of inputs) { const frozen = source.manifest.files.find((file) => file.relativePath === input.relativePath); if (!frozen || frozen.sha256 !== input.sha256 || frozen.size !== input.size) throw new Error("Native actual source differs from frozen authority"); }
  const sdkVersion = plan.componentToolchain.windowsSdkVersion;
  const sdkInclude = path.join(sdk, "Include", sdkVersion), sdkLib = path.join(sdk, "Lib", sdkVersion);
  const sdkInventory = async () => sha256(Buffer.from(canonicalJson({ include: await calculateCompleteByteTreeInventory(sdkInclude), lib: await calculateCompleteByteTreeInventory(sdkLib) })));
  const sdkSha = await sdkInventory();
  const toolRoot = path.resolve(path.dirname(compiler), "..", "..", "..");
  for (const key of ["INCLUDE", "LIB"]) {
    if (!process.env[key]) throw new Error("Native controlled tool environment missing " + key);
    for (const directory of process.env[key].split(";").filter(Boolean)) {
      const actual = await realpath(directory);
      if (!contained(toolRoot, actual) && !contained(sdk, actual)) throw new Error("Native tool environment escapes MSVC/SDK distribution");
    }
  }
  const env = { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", PATH: path.dirname(compiler) + ";C:\\Windows\\System32", INCLUDE: process.env.INCLUDE, LIB: process.env.LIB, TMP: plan.tempDir, TEMP: plan.tempDir };
  const version = async (file, label) => {
    const result = await exec(file, ["/?"], { env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    const match = /Version\s+([\d.]+)/iu.exec(result.stdout + result.stderr); if (!match) throw new Error("Native actual " + label + " version unavailable"); return match[1];
  };
  const tools = { compiler: { name: "cl.exe", version: await version(compiler, "compiler"), sha256: sha256(await readFile(compiler)) }, linker: { name: "link.exe", version: await version(linker, "linker"), sha256: sha256(await readFile(linker)) }, sdk: { name: "WindowsSDK", version: sdkVersion, sha256: sdkSha } };
  if (tools.compiler.version !== plan.componentToolchain.compilerVersion || tools.linker.version !== plan.componentToolchain.linkerVersion) throw new Error("Actual MSVC versions differ from approved declarations");
  const normalizedArgv = nativeComponentArgv(plan.componentDefinition);
  const expand = (arg) => arg.replaceAll("<TEMP>", plan.tempDir.replaceAll("\\", "/")).replaceAll("<SOURCE>", sourceRoot.replaceAll("\\", "/")).replaceAll("<OUTPUT>/" + plan.componentDefinition.executableRelativePath, plan.executable.replaceAll("\\", "/"));
  const compilerArgs = normalizedArgv.filter((arg) => arg.startsWith("compiler:")).map((arg) => expand(arg.slice(9)));
  const linkerArgs = normalizedArgv.filter((arg) => arg.startsWith("linker:")).map((arg) => expand(arg.slice(7)));
  for (const file of [plan.executable, path.join(plan.tempDir, "component.obj"), path.join(plan.tempDir, "component.pdb"), path.join(plan.tempDir, "component-link.pdb")]) await fresh(file);
  await mkdir(plan.buildReceiptDir, { recursive: true });
  const logBase = path.join(plan.buildReceiptDir, plan.componentDefinition.componentName);
  for (const [name, file, args] of [["compiler", compiler, compilerArgs], ["linker", linker, linkerArgs]]) {
    try {
      const result = await exec(file, args, { cwd: plan.tempDir, env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
      await writeFile(logBase + "." + name + ".stdout", result.stdout, { flag: "wx" });
      await writeFile(logBase + "." + name + ".stderr", result.stderr, { flag: "wx" });
    } catch (error) {
      await writeFile(logBase + "." + name + ".failure.json", canonicalJson({ exitCode: error.code ?? null, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }) + "\n", { flag: "wx" });
      throw error;
    }
  }
  if (canonicalJson(inputs) !== canonicalJson(await calculateNativeSourceInputs(sourceRoot)) || tools.compiler.sha256 !== sha256(await readFile(compiler)) || tools.linker.sha256 !== sha256(await readFile(linker)) || sdkSha !== await sdkInventory()) throw new Error("Native source/tool inputs changed during build");
  const executable = await readFile(plan.executable), inspection = inspectNativeExecutable(executable);
  const receipt = createNativeBuildReceipt({ schemaVersion: 1, experimentId: plan.experimentId, executionRunId: plan.executionRunId, source: { sourceCommit: plan.assetHubCommit, sourceArchiveSha256: source.projection.sourceArchiveSha256, nativeSourceIdentity: nativeSourceIdentity(inputs), inputs }, toolchain: tools, build: { configuration: "release-native", normalizedArgv, output: { relativePath: plan.componentDefinition.executableRelativePath, size: executable.length, sha256: sha256(executable) }, inspection }, artifactCreation: { creatorRunId: plan.executionRunId, createdAt: new Date().toISOString() }, observations: { hostname: os.hostname(), compilerPath: compiler, linkerPath: linker, sdkRoot: sdk, workingDirectory: plan.tempDir } });
  await writeFile(logBase + ".receipt.json", nativeBuildReceiptBytes(receipt), { flag: "wx" });
  return { receipt, inspection };
}
