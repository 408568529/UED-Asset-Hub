import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { parseStrictJson, exact } from "./release-json-contract.mjs";
import { stableToolchainIdentity, approvedApplicationDistribution } from "./release-authority-contract.mjs";
import { validateFrozenSourceManifest } from "./frozen-source-authority.mjs";
import { calculateCompleteByteTreeInventory } from "./release-byte-comparison.mjs";
import { assertBuildPlatform, assertContained, materializeArchive, assertPackageLockContract, assertNpmTreeHasNoSecrets, normalizeNpmTree, npmTreeDigest, candidateDependencyProjection } from "./windows-release-constructor.mjs";
const exec = promisify(execFile);
// Authority preparation only: no Constructor, Security Set, Approval, Candidate, or execution budget.
export async function prepareReleaseInputReceipts(plan) {
  exact(plan, ["stagingRoot", "sourceArchive", "sourceManifest", "distributionArchive", "nodeRoot", "workspaceRoot", "outputRoot", "creatorRunId"], "input receipt preparation plan");
  assertBuildPlatform();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(plan.creatorRunId || "")) throw new Error("Receipt creator identity required");
  for (const key of ["sourceArchive", "sourceManifest", "distributionArchive", "nodeRoot", "workspaceRoot", "outputRoot"]) assertContained(plan.stagingRoot, plan[key], key);
  const marker = parseStrictJson(await readFile(path.join(plan.stagingRoot, ".ued-staging-owner.json")));
  if (!marker.creationRunId) throw new Error("Isolated staging owner required");
  for (const mutable of [plan.workspaceRoot, plan.outputRoot]) for (const immutable of [path.dirname(plan.sourceArchive), path.dirname(plan.sourceManifest), path.dirname(plan.distributionArchive), plan.nodeRoot]) {
    const a = path.resolve(mutable).toLowerCase(), b = path.resolve(immutable).toLowerCase();
    if (a === b || a.startsWith(b + path.sep) || b.startsWith(a + path.sep)) throw new Error("Receipt preparation overlaps immutable input");
  }
  const volume = path.parse(path.resolve(plan.stagingRoot)).root[0];
  const { stdout: filesystem } = await exec("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-Volume -DriveLetter '${volume}').FileSystemType.ToString()`], { windowsHide: true });
  if (filesystem.trim() !== "NTFS") throw new Error("Approved NTFS environment required");
  const manifestBytes = await readFile(plan.sourceManifest), archiveBytes = await readFile(plan.sourceArchive);
  const frozen = validateFrozenSourceManifest(manifestBytes, archiveBytes);
  if (!frozen.manifest.frozenSourceIdentity) throw new Error("Complete extended Frozen Source authority required");
  const node = path.join(plan.nodeRoot, "node.exe"), npmRoot = path.join(plan.nodeRoot, "node_modules", "npm"), npm = path.join(npmRoot, "bin", "npm-cli.js");
  const environment = { SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", PATH: plan.nodeRoot + ";C:\\Windows\\System32", TEMP: plan.workspaceRoot, TMP: plan.workspaceRoot, NPM_CONFIG_USERCONFIG: path.join(plan.workspaceRoot, "empty-user.npmrc"), NPM_CONFIG_GLOBALCONFIG: path.join(plan.workspaceRoot, "empty-global.npmrc"), NPM_CONFIG_CACHE: path.join(plan.workspaceRoot, "npm-cache"), NPM_CONFIG_AUDIT: "false", NPM_CONFIG_FUND: "false" };
  if (sha256(await readFile(node)) !== "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e") throw new Error("Approved executable bytes required before tool invocation");
  await mkdir(plan.workspaceRoot); await mkdir(plan.outputRoot);
  for (const name of ["empty-user.npmrc", "empty-global.npmrc"]) await writeFile(path.join(plan.workspaceRoot, name), "", { flag: "wx" });
  const command = async (args, cwd = plan.workspaceRoot) => (await exec(node, args, { env: environment, cwd, windowsHide: true, maxBuffer: 64 * 1024 * 1024 })).stdout;
  const distributionBytes = await readFile(plan.distributionArchive);
  if (distributionBytes.length !== approvedApplicationDistribution.size || sha256(distributionBytes) !== approvedApplicationDistribution.sha256) throw new Error("Exact approved Node ZIP required");
  const core = { distribution: approvedApplicationDistribution, npmPackageJsonSha256: sha256(await readFile(path.join(npmRoot, "package.json"))), bundledTarVersion: parseStrictJson(await readFile(path.join(npmRoot, "node_modules", "tar", "package.json"))).version, bundledTarPackageSha256: sha256(await readFile(path.join(npmRoot, "node_modules", "tar", "package.json"))), nodeVersion: "22.23.3", nodeSha256: sha256(await readFile(node)), npmVersion: "10.9.9", npmCliSha256: sha256(await readFile(npm)), npmDistributionSha256: (await calculateCompleteByteTreeInventory(npmRoot)).sha256, architecture: "x64" };
  if (core.nodeVersion !== "22.23.3" || core.npmVersion !== "10.9.9" || core.nodeSha256 !== "9c9245166b4a8e182e0b797da9c20136117ff24368eaff1fec8343a123c8db0e") throw new Error("Approved actual Node/npm selection required");
  core.identity = stableToolchainIdentity(core);
  const extractedTools = path.join(plan.workspaceRoot, "approved-toolchain-extract"); await mkdir(extractedTools);
  await exec("C:\\Windows\\System32\\tar.exe", ["-xf", plan.distributionArchive, "-C", extractedTools], { env: environment, windowsHide: true });
  if ((await calculateCompleteByteTreeInventory(path.join(extractedTools, "node-v22.23.3-win-x64", "node_modules", "npm"))).sha256 !== core.npmDistributionSha256) throw new Error("Actual npm tree differs from approved ZIP distribution");
  if ((await command(["--version"], plan.nodeRoot)).trim() !== "v22.23.3" || (await command([npm, "--version"], plan.nodeRoot)).trim() !== "10.9.9") throw new Error("Approved toolchain actual versions mismatch");
  const sourceRoot = path.join(plan.workspaceRoot, "source"), workspace = path.join(plan.workspaceRoot, "workspace");
  await materializeArchive({ archive: plan.sourceArchive, sourceRoot, workspace });
  await assertPackageLockContract(path.join(workspace, "package-lock.json"), frozen.projection.lockfileSha256);
  await command([npm, "ci", "--include=dev", "--ignore-scripts", "--no-audit", "--no-fund"], workspace);
  const rawGraph = parseStrictJson(Buffer.from(await command([npm, "ls", "--all", "--json"], workspace))); assertNpmTreeHasNoSecrets(rawGraph);
  const actualNextVersion = parseStrictJson(await readFile(path.join(workspace, "node_modules", "next", "package.json"))).version;
  if (actualNextVersion !== "15.5.19") throw new Error("Dependency actual Next version mismatch");
  const graphIdentity = npmTreeDigest(rawGraph);
  await command([npm, "prune", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], workspace);
  const rawPruned = parseStrictJson(Buffer.from(await command([npm, "ls", "--all", "--omit=dev", "--json"], workspace))); assertNpmTreeHasNoSecrets(rawPruned);
  const tree = await candidateDependencyProjection(path.join(workspace, "node_modules"));
  if (sha256(await readFile(path.join(workspace, "package-lock.json"))) !== frozen.projection.lockfileSha256 || core.nodeSha256 !== sha256(await readFile(node)) || core.npmDistributionSha256 !== (await calculateCompleteByteTreeInventory(npmRoot)).sha256) throw new Error("Receipt inputs changed during preparation");
  const artifactCreation = { creatorRunId: plan.creatorRunId, createdAt: new Date().toISOString() };
  const records = {
    source: { schemaVersion: 1, kind: "FrozenSourceAuthority", source: frozen.projection, baseTree: frozen.manifest.baseTree, archiveSize: archiveBytes.length, frozenSourceIdentity: frozen.manifest.frozenSourceIdentity, artifactCreation: { creatorRunId: frozen.manifest.creationRunId, createdAt: frozen.manifest.createdAt } },
    toolchain: { schemaVersion: 3, kind: "ToolchainReceipt", core, originalAuthorityIdentity: "ec99131c76bbadfb40cb8429a0b88d59825156f5a33982526cca3b75d2dcdc3f", artifactCreation, observations: { hostname: os.hostname(), nodeRoot: plan.nodeRoot } },
    environment: { schemaVersion: 2, kind: "EnvironmentReceipt", profile: { profileId: "win11-x64-ntfs-v1", os: "Windows 11", architecture: "x64", filesystem: "NTFS", sanitizedEnvironmentPolicy: "build-env-v1" }, source: frozen.projection, toolchainIdentity: core.identity, artifactCreation, observations: { hostname: os.hostname(), osBuild: os.release(), workspace } },
    dependency: { schemaVersion: 1, kind: "DependencyReceipt", core: { lockfileSha256: frozen.projection.lockfileSha256, nextVersion: actualNextVersion, graphIdentity, byteTreeIdentity: tree.digest, projectionVersion: 1 }, source: frozen.projection, toolchainIdentity: core.identity, postPruneGraphIdentity: npmTreeDigest(rawPruned), byteTree: tree.files, artifactCreation },
  };
  for (const [name, record] of Object.entries(records)) await writeFile(path.join(plan.outputRoot, name + ".receipt.json"), canonicalJson(record) + "\n", { flag: "wx" });
  await writeFile(path.join(plan.outputRoot, "dependency-graphs.json"), canonicalJson({ installed: normalizeNpmTree(rawGraph), pruned: normalizeNpmTree(rawPruned) }) + "\n", { flag: "wx" });
  return { outputRoot: plan.outputRoot, receipts: Object.fromEntries(Object.entries(records).map(([name, record]) => [name, sha256(Buffer.from(canonicalJson(record) + "\n"))])) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: node prepare-release-input-receipts.mjs <reviewed plan.json>");
  process.stdout.write(canonicalJson(await prepareReleaseInputReceipts(parseStrictJson(await readFile(process.argv[2])))) + "\n");
}
