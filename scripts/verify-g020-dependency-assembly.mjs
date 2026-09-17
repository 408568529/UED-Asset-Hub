import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const run = (command, args, cwd) => new Promise((resolve, reject) => execFile(command, args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout)));

async function inventory(directory, relative = "", files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === ".bin") continue;
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) await inventory(child, childRelative, files);
    else if (entry.isFile()) { const details = await stat(child); files.push({ path: childRelative, size: details.size, sha256: sha256(await readFile(child)) }); }
  }
  return files;
}

async function main() {
  const source = process.cwd(); const workspace = await mkdtemp(path.join(os.tmpdir(), "ued-g020-assembly-"));
  const sourceLock = path.join(source, "package-lock.json"); const before = await readFile(sourceLock);
  try {
    await copyFile(path.join(source, "package.json"), path.join(workspace, "package.json"));
    await copyFile(sourceLock, path.join(workspace, "package-lock.json"));
    await run("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], workspace);
    await run("npm", ["prune", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], workspace);
    assert.deepEqual(await readFile(sourceLock), before, "frozen source lockfile changed during isolated assembly");
    const files = await inventory(path.join(workspace, "node_modules"));
    assert.ok(files.length > 0, "production node_modules is empty");
    const npmTree = await run("npm", ["ls", "--all", "--omit=dev", "--json"], workspace);
    console.log(JSON.stringify({ result: "PASS", frozenSourceLockfileSha256: sha256(before), runtimeNodeModulesManifestSha256: sha256(Buffer.from(JSON.stringify(files))), runtimeNpmTreeSha256: sha256(Buffer.from(npmTree)), runtimeFileCount: files.length }));
  } finally { await rm(workspace, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
