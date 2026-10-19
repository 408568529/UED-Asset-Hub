import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyInternalReleaseManifest } from "./internal-release-contract.mjs";
import { snapshotDependencyTree } from "./competition-dependency-tree.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (file) => JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));

export async function buildCompetitionDirectory({ releaseRoot, toolsReceipt, dshReceipt, sourceBundle, destination, sourceRoot }) {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Competition runtime delivery must be assembled on Windows x64.");
  const release = await verifyInternalReleaseManifest({ payloadRoot: releaseRoot });
  if (release.build.platform !== "win32-x64" || release.build.node !== "v22.23.2") throw new Error("A pinned Windows Internal Release is required.");
  const tools = await readJson(toolsReceipt), dsh = await readJson(dshReceipt);
  const contract = JSON.parse(await readFile(path.join(sourceRoot, "service/windows/competition-tools.json"), "utf8"));
  if (tools.nodeExecutableSha256 !== contract.node.executableSha256 || sha(await readFile(tools.node)) !== contract.node.executableSha256 || tools.gitArchiveSha256 !== contract.git.archiveSha256) throw new Error("Prepared tools do not match the pinned contract.");
  if (dsh.platform !== "win32-x64" || dsh.nodeVersion !== "22.23.2" || dsh.dshCommit !== contract.dshCommit || dsh.genui !== contract.genui || dsh.userDataIncluded !== false || dsh.servicesStarted !== false || sha(await readFile(sourceBundle)) !== dsh.sourceBundleSha256) throw new Error("Fresh dependency preparation identity is invalid.");
  const sourceHead = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (sourceHead !== release.source.commit) throw new Error("Competition tools and Hub release must come from the same committed source.");
  if (execFileSync("git", ["-C", sourceRoot, "status", "--porcelain=v1"], { encoding: "utf8" }).trim()) throw new Error("Competition assembly source must be clean and committed.");
  await mkdir(destination);
  await cp(releaseRoot, path.join(destination, "app"), { recursive: true, errorOnExist: true, force: false });
  await mkdir(path.join(destination, "tools"));
  await cp(tools.nodeRoot, path.join(destination, "tools/node"), { recursive: true, errorOnExist: true, force: false });
  await cp(path.dirname(path.dirname(tools.git)), path.join(destination, "tools/git"), { recursive: true, errorOnExist: true, force: false });
  for (const file of ["competition-first-run.mjs", "competition-dependency-tree.mjs", "competition-prepare-package.mjs", "competition-launch.ps1"]) await copyFile(path.join(sourceRoot, "scripts", file), path.join(destination, "tools", file));
  // Application scripts must already belong to the hashed Internal Release.
  await verifyInternalReleaseManifest({ payloadRoot: path.join(destination, "app") });
  for (const name of ["轻点击我启动.cmd", "停止运行.cmd"]) await copyFile(path.join(sourceRoot, "delivery/competition", name), path.join(destination, name));
  for (const name of ["README.md", "README.html"]) await copyFile(path.join(sourceRoot, "docs/v2.5", name), path.join(destination, name));
  await mkdir(path.join(destination, "dependencies"));
  await copyFile(sourceBundle, path.join(destination, "dependencies/dsh-source.bundle"));
  const runtimeLinks = await snapshotDependencyTree(path.join(dsh.dependencyRoot, "dsh-runtime"), path.join(destination, "dependencies/dsh-runtime"));
  for (const name of await readdir(dsh.genuiHome)) if (!["profiles", "genui-packages"].includes(name)) throw new Error("Plugin preparation includes user state.");
  const profileLinks = await snapshotDependencyTree(dsh.genuiHome, path.join(destination, "dependencies/genui-home"));
  await mkdir(path.join(destination, "licenses"));
  await copyFile(path.join(tools.nodeRoot, "LICENSE"), path.join(destination, "licenses/Node-LICENSE.txt"));
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) await copyFile(path.join(dsh.dependencyRoot, "dsh-source", name), path.join(destination, "licenses", "DSH-" + name));
  await writeFile(path.join(destination, "licenses/SOURCES.md"), `# Bundled sources and notices\n\nNode: ${contract.node.url}\nGit release and corresponding upstream source: ${contract.git.sourceRelease}\nDSH: official pinned source bundle in dependencies/dsh-source.bundle.\nGenUI: pinned package tarball in app/agent-integration/dsh/packages.\nRetain all package LICENSE/COPYING/NOTICE files in tools and dependencies. Full redistribution review and Windows acceptance remain required.\n`);
  const files = [];
  const visit = async (directory) => {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, item.name), relative = path.relative(destination, file).split(path.sep).join("/");
      if (item.name === ".git" || (/^\.env(?:\.|$)/i.test(item.name) && item.name !== ".env.example") || /^\.credentials/i.test(item.name)) throw new Error("Delivery contains forbidden credentials or repository state.");
      const detail = await lstat(file);
      if (detail.isSymbolicLink()) throw new Error("ZIP input must contain regular files; links must have explicit restoration metadata.");
      if (detail.isDirectory()) await visit(file);
      else if (detail.isFile()) files.push({ path: relative, size: detail.size, sha256: sha(await readFile(file)) });
      else throw new Error("Unsupported delivery entry.");
    }
  };
  await visit(destination);
  const manifest = { schemaVersion: 1, channel: "V2.5_COMPETITION", source: release.source, nodeVersion: contract.node.version, gitVersion: contract.git.version, dshCommit: contract.dshCommit, sourceBundleSha256: dsh.sourceBundleSha256, runtimeLinks, profileLinks, files: files.sort((a, b) => a.path.localeCompare(b.path)), newMachineAcceptance: "NEW_MACHINE_NOT_VERIFIED" };
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
