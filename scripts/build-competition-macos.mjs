import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runBuild, validateBuildOwner } from "./competition-build-resources.mjs";
import { buildCompetitionDirectory } from "./build-competition-delivery.mjs";

const [inputDirectory, toolsReceipt, dshBundle, buildRoot, preparedDshReceipt] = process.argv.slice(2);
if (process.platform !== "darwin" || process.arch !== "arm64" || process.versions.node !== "22.23.2") throw new Error("Use the pinned portable Node on native macOS arm64.");
const root = path.resolve(buildRoot);
if (!await validateBuildOwner(root)) {
  await runBuild({ scope: path.dirname(root), work: root, disposable: [...(preparedDshReceipt ? ["source"] : []), "internal-release", "UED-Asset-Hub-macOS-arm64", "temp"], command: process.execPath, args: process.argv.slice(1) });
  process.exit(0);
}
const cacheRoot = process.env.UED_BUILD_CACHE_ROOT;
const tools = JSON.parse(await readFile(toolsReceipt, "utf8")), input = JSON.parse(await readFile(path.join(inputDirectory, "source-input.json"), "utf8"));
await mkdir(root);
await mkdir(path.join(root, "temp"));
for (const name of ["npm-cache", "corepack-cache", "pnpm-store"]) await mkdir(path.join(cacheRoot, name), { recursive: true });
await writeFile(path.join(root, "npmrc"), "registry=https://registry.npmjs.org/\naudit=false\nfund=false\n");
await writeFile(path.join(root, "global-npmrc"), ""); await writeFile(path.join(root, "gitconfig"), "");
const environment = {};
for (const key of ["HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "DEVELOPER_DIR", "SDKROOT", "NODE_EXTRA_CA_CERTS"]) if (process.env[key]) environment[key] = process.env[key];
Object.assign(environment, { PATH: [path.dirname(tools.node), path.dirname(tools.git), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"), TMPDIR: path.join(root, "temp"), TMP: path.join(root, "temp"), TEMP: path.join(root, "temp"), COREPACK_HOME: path.join(cacheRoot, "corepack-cache"), COREPACK_DEFAULT_TO_LATEST: "0", COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", NPM_CONFIG_CACHE: path.join(cacheRoot, "npm-cache"), NPM_CONFIG_USERCONFIG: path.join(root, "npmrc"), NPM_CONFIG_GLOBALCONFIG: path.join(root, "global-npmrc"), npm_config_devdir: path.join(root, "node-gyp-cache"), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"), GIT_EXEC_PATH: path.join(path.dirname(path.dirname(tools.git)), "libexec/git-core"), CI: "true" });
function run(command, args, cwd = root, extraEnvironment = {}) {
  const result = spawnSync(command, args, { cwd, env: { ...environment, ...extraEnvironment }, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Maintainer build command failed: ${path.basename(command)} (exit ${result.status}). No running instance was changed.`);
}
const bundle = path.join(inputDirectory, `ued-asset-hub-${input.commit}.bundle`);
if (createHash("sha256").update(await readFile(bundle)).digest("hex") !== input.bundleSha256) throw new Error("Hub source input checksum mismatch.");
const source = path.join(root, "source"); run(tools.git, ["clone", "--no-checkout", bundle, source]); run(tools.git, ["-C", source, "checkout", "--detach", input.commit]);
const npm = path.join(tools.nodeRoot, "lib/node_modules/npm/bin/npm-cli.js");
if (spawnSync(tools.node, [npm, "--version"], { env: environment, encoding: "utf8" }).stdout.trim() !== "10.9.8") throw new Error("Pinned npm 10.9.8 required.");
run(tools.node, [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund"], source);
run(tools.node, [npm, "run", "build"], source);
// Next regenerates this declaration; restore only this build clone's tracked input.
await writeFile(path.join(source, "next-env.d.ts"), execFileSync(tools.git, ["-C", source, "show", "HEAD:next-env.d.ts"], { env: environment }));
const closurePath = path.join(root, "runtime-closure.json");
run(tools.node, ["scripts/internal-release-contract.mjs", "closure", "--root", source, "--output", closurePath], source);
run(tools.node, [npm, "prune", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], source);
const release = path.join(root, "internal-release"); await mkdir(release);
async function copyRegularTree(origin, destination, skipRootNodeModules = false, relative = "") {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(origin, { withFileTypes: true })) {
    if (entry.name === ".bin" || (skipRootNodeModules && !relative && entry.name === "node_modules")) continue;
    const from = path.join(origin, entry.name), to = path.join(destination, entry.name), nested = path.join(relative, entry.name);
    const detail = await lstat(from);
    if (detail.isSymbolicLink()) throw new Error("Hub production payload contains an unexpected symlink.");
    if (detail.isDirectory()) await copyRegularTree(from, to, false, nested);
    else if (detail.isFile() && !/\.map$/i.test(entry.name) && (!/\.(?:ts|tsx|mts|cts)$/i.test(entry.name) || /\.d\.(?:ts|mts|cts)$/i.test(entry.name))) await copyFile(from, to);
  }
}
await copyRegularTree(path.join(source, ".next/standalone"), release, true);
await copyRegularTree(path.join(source, ".next/static"), path.join(release, ".next/static"));
await copyRegularTree(path.join(source, "public"), path.join(release, "public"));
await copyRegularTree(path.join(source, "node_modules"), path.join(release, "node_modules"));
const closure = JSON.parse(await readFile(closurePath, "utf8"));
for (const relative of new Set([...closure, "scripts/internal-release-contract.mjs", "scripts/internal-release-preflight.mjs", "scripts/host-security-preflight.mjs", "scripts/verify-dsh-runtime-source.mjs", "agent-integration/scripts/dsh-source-validator.mjs"])) {
  await mkdir(path.dirname(path.join(release, relative)), { recursive: true }); await copyFile(path.join(source, relative), path.join(release, relative));
}
await copyRegularTree(path.join(source, "agent-integration/dsh"), path.join(release, "agent-integration/dsh"));
const { writeInternalReleaseManifest } = await import(pathToFileURL(path.join(source, "scripts/internal-release-contract.mjs")).href);
const dshVersion = JSON.parse(await readFile(path.join(source, "agent-integration/dsh/version.json"), "utf8"));
await writeInternalReleaseManifest({ payloadRoot: release, sourceCommit: input.commit, sourceTree: input.tree, releaseVersion: `internal-0.1.1-${input.commit.slice(0, 12)}`, builtAtUtc: new Date().toISOString(), build: { node: "v22.23.2", npm: "10.9.8", platform: "darwin-arm64", visualStudio: "not-applicable:macOS", msvcCompiler: "not-applicable:macOS" }, dsh: { version: dshVersion.version, packageManager: "pnpm@11.7.0", license: "MIT", commit: dshVersion.sourceCommit, tree: dshVersion.sourceTree } });
let dshReceipt = preparedDshReceipt;
if (!dshReceipt) {
const dependencyRoot = path.join(root, "prepared-dependencies"); await mkdir(dependencyRoot);
const dshSource = path.join(dependencyRoot, "dsh-source"), runtime = path.join(dependencyRoot, "dsh-runtime"), profileRoot = path.join(root, "profile-seed"), dshHome = path.join(profileRoot, "dsh-home");
await mkdir(dshHome, { recursive: true });
for (const target of [dshSource, runtime]) { run(tools.git, ["clone", "--no-checkout", "--config", "core.symlinks=true", dshBundle, target]); run(tools.git, ["-C", target, "checkout", "--detach", dshVersion.sourceCommit]); }
const corepack = path.join(tools.nodeRoot, "lib/node_modules/corepack/dist/corepack.js");
const shims = path.join(root, "package-manager-bin"); await mkdir(shims);
run(tools.node, [corepack, "enable", "--install-directory", shims]); environment.PATH = shims + ":" + environment.PATH;
const packageEnvironment = { DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: "1" };
run(tools.node, [corepack, "pnpm", "--store-dir", path.join(cacheRoot, "pnpm-store"), "install", "--frozen-lockfile", "--fetch-timeout", "600000", "--network-concurrency", "4"], runtime, packageEnvironment);
run(tools.node, [corepack, "pnpm", "run", "build"], runtime, packageEnvironment);
await rm(path.join(runtime, ".git"), { recursive: true });
run(tools.node, [path.join(source, "scripts/verify-dsh-runtime-source.mjs"), dshSource, runtime], source, packageEnvironment);
const genuiContract = JSON.parse(await readFile(path.join(source, "agent-integration/dsh/genui-plugin.json"), "utf8"));
const tarball = path.join(source, genuiContract.packageTarball);
if (createHash("sha256").update(await readFile(tarball)).digest("hex") !== genuiContract.packageTarballSha256) throw new Error("GenUI tarball checksum mismatch.");
run(tools.node, ["--import", "tsx/esm", "apps/cli/src/bin.ts", "plugin", "--profile", "web", "add", tarball, "--save-exact", "--ignore-scripts", "--store-dir", path.join(cacheRoot, "pnpm-store")], runtime, packageEnvironment);
const profilePath = path.join(dshHome, "profiles/web/package.json"), profile = JSON.parse(await readFile(profilePath, "utf8"));
profile.dsh.profile.bundles = profile.dsh.profile.bundles.filter((name) => name !== "dsh-plugin-genui"); await writeFile(profilePath, JSON.stringify(profile, null, 2) + "\n");
for (const patch of ["genui-client-load-liveness.mjs", "genui-haldur-reading.mjs"]) run(tools.node, [path.join(source, "agent-integration/scripts", patch), dshHome], source, packageEnvironment);
const receipt = { schemaVersion: 1, platform: "darwin-arm64", nodeVersion: "22.23.2", dshCommit: dshVersion.sourceCommit, genui: "0.15.1", dependencyRoot, genuiHome: dshHome, sourceBundleSha256: createHash("sha256").update(await readFile(dshBundle)).digest("hex"), userDataIncluded: false, servicesStarted: false };
dshReceipt = path.join(root, "dsh-preparation.json"); await writeFile(dshReceipt, JSON.stringify(receipt, null, 2) + "\n");
}
const candidate = path.join(root, "UED-Asset-Hub-macOS-arm64");
await buildCompetitionDirectory({ releaseRoot: release, toolsReceipt, dshReceipt, sourceBundle: dshBundle, destination: candidate, sourceRoot: source });
const zip = path.join(root, `UED-Asset-Hub-V2.5-${input.commit.slice(0, 12)}-macOS-arm64.zip`);
run("/usr/bin/ditto", ["-c", "-k", "--keepParent", candidate, zip]);
const digest = createHash("sha256").update(await readFile(zip)).digest("hex"); await writeFile(zip + ".sha256", `${digest}  ${path.basename(zip)}\n`);
console.log(JSON.stringify({ zip, sha256: digest, source: { commit: input.commit, tree: input.tree }, status: "NOT_NEW_MACHINE_VERIFIED" }));
