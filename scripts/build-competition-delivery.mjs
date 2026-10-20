import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyInternalReleaseManifest } from "./internal-release-contract.mjs";
import { snapshotDependencyTree } from "./competition-dependency-tree.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (file) => JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));

export async function buildCompetitionDirectory({ releaseRoot, toolsReceipt, dshReceipt, sourceBundle, destination, sourceRoot }) {
  const platform = `${process.platform}-${process.arch}`;
  if (!["win32-x64", "darwin-arm64"].includes(platform)) throw new Error("Build on the native Windows x64 or macOS arm64 target.");
  const release = await verifyInternalReleaseManifest({ payloadRoot: releaseRoot });
  if (release.build.platform !== platform || release.build.node !== "v22.23.2") throw new Error("A pinned native Internal Release is required.");
  const tools = await readJson(toolsReceipt), dsh = await readJson(dshReceipt);
  const contract = JSON.parse(await readFile(path.join(sourceRoot, process.platform === "win32" ? "service/windows/competition-tools.json" : "service/macos/competition-tools.json"), "utf8"));
  if (tools.nodeExecutableSha256 !== contract.node.executableSha256 || sha(await readFile(tools.node)) !== contract.node.executableSha256 || tools.gitArchiveSha256 !== contract.git.archiveSha256) throw new Error("Prepared tools do not match the pinned contract.");
  if (dsh.platform !== platform || dsh.nodeVersion !== "22.23.2" || dsh.dshCommit !== contract.dshCommit || dsh.genui !== contract.genui || dsh.userDataIncluded !== false || dsh.servicesStarted !== false || sha(await readFile(sourceBundle)) !== dsh.sourceBundleSha256) throw new Error("Fresh dependency preparation identity is invalid.");
  const sourceHead = execFileSync(tools.git, ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (sourceHead !== release.source.commit) throw new Error("Competition tools and Hub release must come from the same committed source.");
  if (execFileSync(tools.git, ["-C", sourceRoot, "status", "--porcelain=v1"], { encoding: "utf8" }).trim()) throw new Error("Competition assembly source must be clean and committed.");
  await mkdir(destination);
  await cp(releaseRoot, path.join(destination, "app"), { recursive: true, errorOnExist: true, force: false });
  await mkdir(path.join(destination, "tools"));
  if (process.platform === "win32") {
    await cp(tools.nodeRoot, path.join(destination, "tools/node"), { recursive: true, errorOnExist: true, force: false });
    await cp(path.dirname(path.dirname(tools.git)), path.join(destination, "tools/git"), { recursive: true, errorOnExist: true, force: false });
  } else {
    await mkdir(path.join(destination, "tools/node/bin"), { recursive: true });
    await copyFile(tools.node, path.join(destination, "tools/node/bin/node"));
    await chmod(path.join(destination, "tools/node/bin/node"), 0o755);
    await mkdir(path.join(destination, "tools/git/bin"), { recursive: true });
    await mkdir(path.join(destination, "tools/git/libexec/git-core"), { recursive: true });
    for (const relative of ["tools/git/bin/git", "tools/git/libexec/git-core/git"]) { await copyFile(tools.git, path.join(destination, relative)); await chmod(path.join(destination, relative), 0o755); }
  }
  for (const file of ["competition-center.mjs", "competition-center.html", "competition-center-private.ps1", "competition-choose-folder.ps1", "competition-first-run.mjs", "competition-dependency-tree.mjs", "competition-prepare-package.mjs", "competition-check.mjs", "competition-launcher.mjs", "competition-launch.ps1", "competition-private-config.ps1"]) await copyFile(path.join(sourceRoot, "scripts", file), path.join(destination, "tools", file));
  const centerAssets = path.join(sourceRoot, "delivery/competition/center");
  const centerManifest = await readJson(path.join(centerAssets, "manifest.json"));
  if (centerManifest.schemaVersion !== 1 || !Array.isArray(centerManifest.inputs) || !centerManifest.inputs.length || !Array.isArray(centerManifest.files) || centerManifest.files.length !== 3 || new Set(centerManifest.files.map(file => file.path)).size !== 3) throw new Error("Prepared launcher UI manifest is incomplete.");
  for (const input of centerManifest.inputs) {
    if (path.isAbsolute(input.path) || input.path.split("/").includes("..") || sha(await readFile(path.join(sourceRoot, input.path))) !== input.sha256) throw new Error("Launcher UI is stale; run the maintainer UI build before committing source.");
  }
  for (const output of centerManifest.files) {
    if (!["center.js", "center.css", "center.js.LEGAL.txt"].includes(output.path) || sha(await readFile(path.join(centerAssets, output.path))) !== output.sha256) throw new Error("Prepared launcher UI integrity mismatch.");
  }
  await cp(centerAssets, path.join(destination, "tools/center"), { recursive: true, errorOnExist: true, force: false });
  // Application scripts must already belong to the hashed Internal Release.
  await verifyInternalReleaseManifest({ payloadRoot: path.join(destination, "app") });
  const suffix = process.platform === "win32" ? ".cmd" : ".command";
  for (const name of ["01-检测运行环境", "02-轻点击我启动", "03-停止运行"]) { const target = path.join(destination, name + suffix); await copyFile(path.join(sourceRoot, "delivery/competition", name + suffix), target); if (process.platform !== "win32") await chmod(target, 0o755); }
  for (const name of ["README.md", "README.html"]) await copyFile(path.join(sourceRoot, "docs/v2.5", name), path.join(destination, name));
  await mkdir(path.join(destination, "dependencies"));
  // Build and freeze a real upstream-only Git checkout. End users never clone or install.
  const sourceCheckout = destination + ".dsh-authority";
  execFileSync(tools.git, ["clone", "--no-hardlinks", "--no-checkout", "--config", "core.symlinks=true", sourceBundle, sourceCheckout], { stdio: ["ignore", "pipe", "pipe"] });
  execFileSync(tools.git, ["-C", sourceCheckout, "checkout", "--detach", contract.dshCommit], { stdio: ["ignore", "pipe", "pipe"] });
  execFileSync(tools.git, ["-C", sourceCheckout, "remote", "set-url", "origin", "https://github.com/deepseek-ai/deepseek-harness.git"]);
  const sourceLinks = await snapshotDependencyTree(sourceCheckout, path.join(destination, "dependencies/dsh-source"));
  const runtimeLinks = await snapshotDependencyTree(path.join(dsh.dependencyRoot, "dsh-runtime"), path.join(destination, "dependencies/dsh-runtime"));
  const presetCheckData = destination + ".preset-check-data"; await mkdir(presetCheckData);
  const priorDirectory = process.cwd(); process.chdir(releaseRoot);
  let presetInstaller;
  try { presetInstaller = (await import(pathToFileURL(path.join(releaseRoot, "scripts/host-supervisor.mjs")).href)).installAgentPresets; }
  finally { process.chdir(priorDirectory); }
  await presetInstaller({ dataRoot: await realpath(presetCheckData), agentRoot: await realpath(path.dirname(dsh.genuiHome)) });
  for (const name of await readdir(dsh.genuiHome)) if (!["profiles", "genui-packages", ".agent-presets"].includes(name)) throw new Error("Plugin preparation includes user state.");
  const profileLinks = await snapshotDependencyTree(dsh.genuiHome, path.join(destination, "dependencies/genui-home"), path.join(dsh.dependencyRoot, "dsh-runtime"));
  await mkdir(path.join(destination, "licenses"));
  await copyFile(path.join(tools.nodeRoot, "LICENSE"), path.join(destination, "licenses/Node-LICENSE.txt"));
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) await copyFile(path.join(dsh.dependencyRoot, "dsh-source", name), path.join(destination, "licenses", "DSH-" + name));
  if (tools.gitSourceArchive) await copyFile(tools.gitSourceArchive, path.join(destination, "licenses/Git-corresponding-source.tar.xz"));
  if (tools.gitLicense) await copyFile(tools.gitLicense, path.join(destination, "licenses/Git-COPYING.txt"));
  await writeFile(path.join(destination, "licenses/SOURCES.md"), `# Bundled sources and notices\n\nNode: ${contract.node.url}\nGit release and corresponding upstream source: ${contract.git.sourceRelease}\nDSH: official pinned source and its upstream-only Git records in dependencies/dsh-source.\nGenUI: pinned package tarball in app/agent-integration/dsh/packages.\nRetain all package LICENSE/COPYING/NOTICE files in tools and dependencies. Full redistribution review and Windows acceptance remain required.\n`);
  const files = [];
  const visit = async (directory) => {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name), relative = path.relative(destination, file).split(path.sep).join("/");
      if ((item.name === ".git" && relative !== "dependencies/dsh-source/.git") || (/^\.env(?:\.|$)/i.test(item.name) && item.name !== ".env.example") || /^\.credentials/i.test(item.name)) throw new Error("Delivery contains forbidden credentials or repository state.");
      const detail = await lstat(file);
      if (detail.isSymbolicLink()) throw new Error("ZIP input must contain regular files; links must have explicit restoration metadata.");
      if (detail.isDirectory()) await visit(file);
      else if (detail.isFile()) files.push({ path: relative, size: detail.size, sha256: sha(await readFile(file)) });
      else throw new Error("Unsupported delivery entry.");
    }
  };
  await visit(destination);
  const manifest = { schemaVersion: 1, channel: "V2.5_COMPETITION", platform, localModeVersion: 1, source: release.source, nodeVersion: contract.node.version, gitVersion: contract.git.version, dshCommit: contract.dshCommit, sourceBundleSha256: dsh.sourceBundleSha256, sourceLinks, runtimeLinks, profileLinks, files: files.sort((a, b) => a.path.localeCompare(b.path)), newMachineAcceptance: "NEW_MACHINE_NOT_VERIFIED" };
  await writeFile(path.join(destination, "competition-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return { source: release.source, fileCount: files.length, runtimeLinks: runtimeLinks.length, profileLinks: profileLinks.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [releaseRoot, toolsReceipt, dshReceipt, sourceBundle, destination] = process.argv.slice(2);
    const result = await buildCompetitionDirectory({ releaseRoot, toolsReceipt, dshReceipt, sourceBundle, destination, sourceRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..") });
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
