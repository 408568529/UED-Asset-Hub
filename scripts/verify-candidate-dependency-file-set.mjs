import assert from "node:assert/strict";
import { copyFile, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalJson } from "./release-artifact-tree.mjs";
import { candidateDependencyProjection, copyCandidateDependencyTree, verifyCandidateDependencyTree } from "./windows-release-constructor.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-candidate-dependencies-"));
const source = path.join(root, "source", "node_modules");
const candidate = path.join(root, "candidate", "node_modules");
const put = async (base, relative, value) => {
  const target = path.join(base, ...relative.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
  return target;
};

try {
  await put(source, ".bin/root-tool.cmd", "root shim\n");
  await put(source, "package-a/index.js", "module.exports = 1;\n");
  await put(source, "package-a/node_modules/nanoid/package.json", '{"name":"nanoid","bin":"./bin/nanoid.js"}\n');
  const nestedBin = "package-a/node_modules/.bin/nanoid";
  await put(source, nestedBin, "#!/bin/sh\n");
  await put(source, `${nestedBin}.cmd`, "@echo off\r\n");
  await put(source, `${nestedBin}.ps1`, "Write-Output nanoid\r\n");

  const first = await candidateDependencyProjection(source);
  const second = await candidateDependencyProjection(source);
  assert.equal(canonicalJson(first), canonicalJson(second), "path set, per-file identity, and digest must be deterministic");
  assert(!first.files.some(({ path: relative }) => relative.startsWith(".bin/")), "root .bin is excluded by the existing release policy");
  for (const relative of ["package-a/index.js", "package-a/node_modules/nanoid/package.json", nestedBin, `${nestedBin}.cmd`, `${nestedBin}.ps1`]) {
    assert(first.files.some((file) => file.path === relative), `approved Candidate file missing from projection: ${relative}`);
  }

  await copyCandidateDependencyTree(source, candidate);
  const complete = await verifyCandidateDependencyTree(first, candidate);
  assert.equal(complete.digest, first.digest, "complete Candidate byte tree must match the projection");
  assert.equal((await lstat(path.join(candidate, ...nestedBin.split("/")))).isFile(), true, "nested npm shim remains a regular file");

  const cmd = path.join(candidate, ...`${nestedBin}.cmd`.split("/"));
  await rm(cmd);
  await assert.rejects(() => verifyCandidateDependencyTree(first, candidate), /Candidate node_modules differ/);
  await copyFile(path.join(source, ...`${nestedBin}.cmd`.split("/")), cmd);

  const extra = await put(candidate, "package-a/node_modules/extra.txt", "extra\n");
  await assert.rejects(() => verifyCandidateDependencyTree(first, candidate), /Candidate node_modules differ/);
  await rm(extra);

  const original = await readFile(cmd);
  await writeFile(cmd, "changed\n");
  await assert.rejects(() => verifyCandidateDependencyTree(first, candidate), /Candidate node_modules differ/);
  await writeFile(cmd, original);

  const ps1 = path.join(candidate, ...`${nestedBin}.ps1`.split("/"));
  await rm(ps1);
  try {
    await symlink("nanoid.cmd", ps1, "file");
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) throw error;
    await link(cmd, ps1);
  }
  await assert.rejects(() => verifyCandidateDependencyTree(first, candidate), /links are not allowed/);
  await rm(ps1);
  await copyFile(path.join(source, ...`${nestedBin}.ps1`.split("/")), ps1);
  assert.equal((await verifyCandidateDependencyTree(first, candidate)).digest, first.digest);
  console.log("CANDIDATE_DEPENDENCY_FILE_SET_PASS complete missing extra bytes file-type deterministic");
} finally {
  await rm(root, { recursive: true, force: true });
}
