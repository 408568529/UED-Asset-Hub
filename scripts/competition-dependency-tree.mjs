import { copyFile, lstat, mkdir, readdir, realpath, symlink } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const inside = (root, target) => { const relative = path.relative(root, target); return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)); };
const portable = (value) => value.split(path.sep).join("/");

// ZIP stores only regular bytes. Windows junctions are recorded and rebased on extraction.
// Following pnpm junctions recursively would duplicate graphs and can recurse through cycles.
export async function snapshotDependencyTree(sourceRoot, destinationRoot, runtimeRoot = null) {
  const source = await realpath(sourceRoot), destination = path.resolve(destinationRoot), links = [];
  const runtime = runtimeRoot ? await realpath(runtimeRoot) : null;
  if (inside(source, destination) || inside(destination, source)) throw new Error("Dependency source and destination must be separate.");
  await mkdir(destination);
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name), relative = path.relative(source, file), target = path.join(destination, relative);
      const detail = await lstat(file);
      if (detail.isSymbolicLink()) {
        const canonical = await realpath(file);
        const externalRuntime = !inside(source, canonical) && runtime && inside(runtime, canonical) && portable(relative).startsWith("profiles/node_modules/");
        if (!inside(source, canonical) && !externalRuntime) throw new Error("A dependency link escapes its prepared tree.");
        links.push({ path: portable(relative), target: portable(path.relative(externalRuntime ? runtime : source, canonical)), kind: (await lstat(canonical)).isDirectory() ? "directory" : "file", ...(externalRuntime ? { scope: "runtime" } : {}) });
      } else if (detail.isDirectory()) { await mkdir(target); await visit(file); }
      else if (detail.isFile()) { await copyFile(file, target, constants.COPYFILE_EXCL); }
      else throw new Error("Unsupported dependency filesystem entry.");
    }
  };
  await visit(source);
  return links.sort((a, b) => a.path.localeCompare(b.path));
}

export async function restoreDependencyLinks(root, links, runtimeRoot = null, directorySymlinks = false) {
  const canonical = await realpath(root);
  const runtime = runtimeRoot ? await realpath(runtimeRoot) : null;
  const resolve = (relative, base = canonical) => {
    if (typeof relative !== "string" || !relative || relative.includes("\\") || relative.includes(":") || relative.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Unsafe dependency link path.");
    const absolute = path.resolve(base, ...relative.split("/"));
    if (!inside(base, absolute)) throw new Error("Dependency link escapes the package.");
    return absolute;
  };
  const destinations = new Set();
  for (const link of links) {
    if (link.scope && (link.scope !== "runtime" || !runtime || !link.path.startsWith("profiles/node_modules/") || link.kind !== "directory")) throw new Error("Only the upstream profile module fallback may link to the verified runtime.");
    const output = resolve(link.path), targetRoot = link.scope ? runtime : canonical, target = resolve(link.target, targetRoot);
    if (!["directory", "file"].includes(link.kind) || destinations.has(output.toLowerCase())) throw new Error("Invalid or duplicate dependency link.");
    destinations.add(output.toLowerCase());
    // Both parent and target must already exist inside this tree; never create arbitrary ancestors.
    if (!inside(canonical, await realpath(path.dirname(output))) || !inside(targetRoot, await realpath(target))) throw new Error("Dependency link has an external parent or target.");
    if ((await lstat(target)).isDirectory() !== (link.kind === "directory")) throw new Error("Dependency link target type mismatch.");
    try {
      const existing = await lstat(output);
      if (!existing.isSymbolicLink() || await realpath(output) !== await realpath(target)) throw new Error("Existing dependency link differs from the prepared package.");
      continue;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const junction = process.platform === "win32" && link.kind === "directory" && !directorySymlinks;
    await symlink(junction ? target : path.relative(path.dirname(output), target), output, junction ? "junction" : link.kind === "directory" ? "dir" : "file");
  }
}

export async function copyPreparedProfile(source, destination, runtimeRoot = null) {
  const links = await snapshotDependencyTree(source, destination, runtimeRoot);
  await restoreDependencyLinks(destination, links, runtimeRoot);
}
