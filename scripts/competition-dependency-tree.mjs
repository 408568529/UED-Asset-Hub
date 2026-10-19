import { copyFile, lstat, mkdir, readdir, realpath, symlink } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const inside = (root, target) => { const relative = path.relative(root, target); return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)); };
const portable = (value) => value.split(path.sep).join("/");

// ZIP stores only regular bytes. Windows junctions are recorded and rebased on extraction.
// Following pnpm junctions recursively would duplicate graphs and can recurse through cycles.
export async function snapshotDependencyTree(sourceRoot, destinationRoot) {
  const source = await realpath(sourceRoot), destination = path.resolve(destinationRoot), links = [];
  if (inside(source, destination) || inside(destination, source)) throw new Error("Dependency source and destination must be separate.");
  await mkdir(destination);
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name), relative = path.relative(source, file), target = path.join(destination, relative);
      const detail = await lstat(file);
      if (detail.isSymbolicLink()) {
        const canonical = await realpath(file);
        if (!inside(source, canonical)) throw new Error("A dependency link escapes its prepared tree.");
        links.push({ path: portable(relative), target: portable(path.relative(source, canonical)), kind: (await lstat(canonical)).isDirectory() ? "directory" : "file" });
      } else if (detail.isDirectory()) { await mkdir(target); await visit(file); }
      else if (detail.isFile()) { await copyFile(file, target, constants.COPYFILE_EXCL); }
      else throw new Error("Unsupported dependency filesystem entry.");
    }
  };
  await visit(source);
  return links.sort((a, b) => a.path.localeCompare(b.path));
}

export async function restoreDependencyLinks(root, links) {
  const canonical = await realpath(root);
  const resolve = (relative) => {
    if (typeof relative !== "string" || !relative || relative.includes("\\") || relative.includes(":") || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Unsafe dependency link path.");
    const absolute = path.resolve(canonical, ...relative.split("/"));
    if (!inside(canonical, absolute)) throw new Error("Dependency link escapes the package.");
    return absolute;
  };
  const destinations = new Set();
  for (const link of links) {
    const output = resolve(link.path), target = resolve(link.target);
    if (!["directory", "file"].includes(link.kind) || destinations.has(output.toLowerCase())) throw new Error("Invalid or duplicate dependency link.");
    destinations.add(output.toLowerCase());
    // Both parent and target must already exist inside this tree; never create arbitrary ancestors.
    if (!inside(canonical, await realpath(path.dirname(output))) || !inside(canonical, await realpath(target))) throw new Error("Dependency link has an external parent or target.");
    if ((await lstat(target)).isDirectory() !== (link.kind === "directory")) throw new Error("Dependency link target type mismatch.");
    try {
      const existing = await lstat(output);
      if (!existing.isSymbolicLink() || await realpath(output) !== await realpath(target)) throw new Error("Existing dependency link differs from the prepared package.");
      continue;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const junction = process.platform === "win32" && link.kind === "directory";
    await symlink(junction ? target : path.relative(path.dirname(output), target), output, junction ? "junction" : link.kind === "directory" ? "dir" : "file");
  }
}

export async function copyPreparedProfile(source, destination) {
  const links = await snapshotDependencyTree(source, destination);
  await restoreDependencyLinks(destination, links);
}
