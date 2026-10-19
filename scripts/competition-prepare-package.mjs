import { execFileSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toolPaths } from "./competition-check.mjs";
import { restoreDependencyLinks } from "./competition-dependency-tree.mjs";

export async function prepareCompetitionPackage(packageRoot) {
  if (!["win32-x64", "darwin-arm64"].includes(`${process.platform}-${process.arch}`)) throw new Error("A native Windows x64 or macOS arm64 package is required.");
  const root = await realpath(packageRoot), dependencyRoot = path.join(root, "dependencies");
  const manifest = JSON.parse(await readFile(path.join(root, "competition-manifest.json"), "utf8"));
  if (manifest.dshCommit !== "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e") throw new Error("Pinned DSH source identity mismatch.");
  await restoreDependencyLinks(path.join(dependencyRoot, "dsh-source"), manifest.sourceLinks);
  await restoreDependencyLinks(path.join(dependencyRoot, "dsh-runtime"), manifest.runtimeLinks);
  await restoreDependencyLinks(path.join(dependencyRoot, "genui-home"), manifest.profileLinks, path.join(dependencyRoot, "dsh-runtime"));
  const source = path.join(dependencyRoot, "dsh-source");
  const git = toolPaths(root).git;
  const runGit = (args) => execFileSync(git, args, { encoding: "utf8", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" }, stdio: ["ignore", "pipe", "pipe"] }).trim();
  if ((await lstat(source)).isSymbolicLink() || await realpath(source) !== source || runGit(["-C", source, "rev-parse", "HEAD"]) !== manifest.dshCommit || runGit(["-C", source, "status", "--porcelain=v1"])) throw new Error("Existing DSH authority is not the exact clean checkout; no overwrite was attempted.");
  execFileSync(process.execPath, [path.join(root, "app/scripts/verify-dsh-runtime-source.mjs"), source, path.join(dependencyRoot, "dsh-runtime")], { cwd: path.join(root, "app"), stdio: ["ignore", "pipe", "pipe"] });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepareCompetitionPackage(process.argv[2]); console.log("Prepared package identity and runtime links verified; no user data or service was changed."); }
  catch { console.error("Prepared dependencies could not be verified or restored. Check Windows symlink permission and package integrity. No source/runtime validation was bypassed."); process.exitCode = 1; }
}
