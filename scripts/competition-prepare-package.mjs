import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { restoreDependencyLinks } from "./competition-dependency-tree.mjs";

export async function prepareCompetitionPackage(packageRoot) {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("A Windows x64 package is required.");
  const root = await realpath(packageRoot), dependencyRoot = path.join(root, "dependencies");
  const manifest = JSON.parse(await readFile(path.join(root, "competition-manifest.json"), "utf8"));
  const bundle = path.join(dependencyRoot, "dsh-source.bundle");
  if (manifest.dshCommit !== "b150a551b8d465e31e418e1b2eaf5e79bbb7d28e" || createHash("sha256").update(await readFile(bundle)).digest("hex") !== manifest.sourceBundleSha256) throw new Error("Pinned DSH bundle identity mismatch.");
  await restoreDependencyLinks(path.join(dependencyRoot, "dsh-runtime"), manifest.runtimeLinks);
  await restoreDependencyLinks(path.join(dependencyRoot, "genui-home"), manifest.profileLinks);
  const source = path.join(dependencyRoot, "dsh-source");
  const git = path.join(root, "tools/git/cmd/git.exe");
  const runGit = (args) => execFileSync(git, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try { await access(source); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    runGit(["clone", "--no-checkout", "--config", "core.symlinks=true", bundle, source]);
    runGit(["-C", source, "checkout", "--detach", manifest.dshCommit]);
  }
  if ((await lstat(source)).isSymbolicLink() || await realpath(source) !== source || runGit(["-C", source, "rev-parse", "HEAD"]) !== manifest.dshCommit || runGit(["-C", source, "status", "--porcelain=v1"])) throw new Error("Existing DSH authority is not the exact clean checkout; no overwrite was attempted.");
  execFileSync(process.execPath, [path.join(root, "app/scripts/verify-dsh-runtime-source.mjs"), source, path.join(dependencyRoot, "dsh-runtime")], { cwd: path.join(root, "app"), stdio: ["ignore", "pipe", "pipe"] });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepareCompetitionPackage(process.argv[2]); console.log("Prepared package identity and runtime links verified; no user data or service was changed."); }
  catch { console.error("Prepared dependencies could not be verified or restored. Check Windows symlink permission and package integrity. No source/runtime validation was bypassed."); process.exitCode = 1; }
}
