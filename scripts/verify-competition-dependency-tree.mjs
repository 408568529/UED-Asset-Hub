import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { snapshotDependencyTree, restoreDependencyLinks, copyPreparedProfile } from "./competition-dependency-tree.mjs";

const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "ued-v25-tree-")));
try {
  const source = path.join(root, "source"), destination = path.join(root, "moved 含空格");
  await mkdir(path.join(source, "packages/a"), { recursive: true });
  await mkdir(path.join(source, "node_modules"));
  await writeFile(path.join(source, "packages/a/index.js"), "export const value = 1;\n");
  await symlink(path.join(source, "packages/a"), path.join(source, "node_modules/a"), process.platform === "win32" ? "junction" : "dir");
  // A real package graph cycle must be serialized as links, never recursively copied.
  await symlink(path.join(source, "node_modules"), path.join(source, "packages/a/dependencies"), process.platform === "win32" ? "junction" : "dir");
  const links = await snapshotDependencyTree(source, destination);
  assert.equal(links.length, 2);
  await restoreDependencyLinks(destination, links);
  await restoreDependencyLinks(destination, links);
  assert.equal(await realpath(path.join(destination, "node_modules/a")), path.join(destination, "packages/a"));
  assert.equal(await readFile(path.join(destination, "node_modules/a/index.js"), "utf8"), "export const value = 1;\n");
  await copyPreparedProfile(source, path.join(root, "new-profile"));
  await assert.rejects(restoreDependencyLinks(destination, [{ path: "../escape", target: "packages/a", kind: "directory" }]), /Unsafe/);
  await assert.rejects(restoreDependencyLinks(destination, [{ path: "node_modules/a", target: "packages", kind: "directory" }]), /differs/);
  const external = path.join(root, "external"); await mkdir(external);
  await symlink(external, path.join(source, "node_modules/external"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(snapshotDependencyTree(source, path.join(root, "invalid-copy")), /escapes/);
  console.log("[V2.5] relocatable junction graph, cycles, idempotency, profile copy, traversal and external-link rejection: PASS");
} finally { await rm(root, { recursive: true, force: true }); }
