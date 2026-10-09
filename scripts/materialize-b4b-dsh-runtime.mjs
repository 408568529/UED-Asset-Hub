import { createHash } from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { cp, copyFile, lstat, mkdir, readlink, readFile, readdir, stat, symlink } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => value.startsWith("--") && values[index + 1] ? [...pairs, [value.slice(2), values[index + 1]]] : pairs, []));
const runId = options["run-id"], b4bRoot = path.resolve(options["b4b-root"] || ""), expectedLeaf = runId;
if (process.platform !== "win32" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{6,46}[A-Za-z0-9])?$/.test(runId || "") || path.win32.basename(b4bRoot) !== expectedLeaf || path.win32.dirname(b4bRoot).toLowerCase() !== "d:\\ued-asset-hub-staging\\b4b") throw new Error("B4B DSH runtime identity is invalid.");
const source = path.join(b4bRoot, "dsh-git-authority-v2"), buildSource = path.join(b4bRoot, "dsh-build-v2"), runtime = path.join(b4bRoot, "dsh-runtime-v2"), candidate = path.join(b4bRoot, "current");
const expected = JSON.parse(await readFile(path.join(candidate, "agent-integration", "dsh", "version.json"), "utf8"));
const validatorUrl = pathToFileURL(path.join(b4bRoot, "source-root", "agent-integration", "scripts", "dsh-source-validator.mjs")).href;
const { validateDshRuntimeSource, validateDshSourceIdentity } = await import(validatorUrl);
async function treeFingerprint(root) {
  const digest = createHash("sha256");
  let fileCount = 0;
  async function visit(directory, relative = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = path.join(directory, entry.name), childRelative = relative ? `${relative}/${entry.name}` : entry.name, info = await lstat(child);
      digest.update(`${childRelative.length}:${childRelative}:`);
      if (info.isSymbolicLink()) { const target = await readlink(child); if (path.isAbsolute(target) || path.win32.isAbsolute(target)) throw new Error("B4B DSH runtime input contains an absolute link."); digest.update(`link:${target.length}:${target}`); continue; }
      if (info.isDirectory()) { digest.update("dir:"); await visit(child, childRelative); continue; }
      if (!info.isFile()) throw new Error("B4B DSH runtime input contains an unsupported file.");
      const content = await readFile(child); digest.update(`file:${content.length}:`); digest.update(content); fileCount++;
    }
  }
  await visit(root);
  return { sha256: digest.digest("hex"), fileCount };
}
async function copyOrVerifyTree(from, to) {
  const sourceInfo = await lstat(from);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error("B4B DSH runtime input is invalid.");
  try {
    const targetInfo = await lstat(to);
    if (!targetInfo.isDirectory() || targetInfo.isSymbolicLink()) throw new Error("B4B DSH runtime target is invalid.");
    const [sourceFingerprint, targetFingerprint] = await Promise.all([treeFingerprint(from), treeFingerprint(to)]);
    if (sourceFingerprint.sha256 !== targetFingerprint.sha256 || sourceFingerprint.fileCount !== targetFingerprint.fileCount) throw new Error("B4B DSH runtime input differs from build workspace.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { recursive: true, verbatimSymlinks: true });
  }
}
const identity = await validateDshSourceIdentity(source, expected, { readOnly: true });
if (identity.commit !== expected.sourceCommit) throw new Error("B4B DSH source commit is not the approved commit.");
const buildCommit = execFileSync("git", ["-C", buildSource, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
const buildTree = execFileSync("git", ["-C", buildSource, "rev-parse", "HEAD^{tree}"], { encoding: "utf8", windowsHide: true }).trim();
if (buildCommit !== identity.commit || buildTree !== identity.tree) throw new Error("B4B DSH build workspace identity differs from clean authority.");
execFileSync("git", ["-C", buildSource, "diff", "--quiet", "HEAD"], { windowsHide: true });
execFileSync("git", ["-C", buildSource, "diff", "--cached", "--quiet", "HEAD"], { windowsHide: true });
const verifyBuildRecord = () => JSON.parse(execFileSync(process.execPath, ["--import", "tsx/esm", "--input-type=module", "-e", "import { readClientBuildRecord } from './scripts/client-build-environment.ts'; console.log(JSON.stringify(readClientBuildRecord(process.cwd())));"], { cwd: buildSource, encoding: "utf8", windowsHide: true }));
const buildRecord = verifyBuildRecord();
if (buildRecord.environment?.DSH_CLIENT_COMMIT_HASH !== identity.commit.slice(0, 7) || !/^[a-f0-9]{64}$/u.test(buildRecord.artifacts?.sha256 || "") || !Number.isInteger(buildRecord.artifacts?.fileCount) || buildRecord.artifacts.fileCount < 1) throw new Error("B4B DSH client build identity is invalid.");
const records = execFileSync("git", ["-C", source, "ls-files", "--stage", "-z"], { encoding: "utf8", windowsHide: true }).split("\0").filter(Boolean);
const parsedRecords = records.map((record) => {
  const match = /^(100644|100755|120000) [a-f0-9]{40} \d\t(.+)$/u.exec(record);
  if (!match) throw new Error("B4B DSH source has an unsupported tracked entry.");
  return { mode: match[1], relative: match[2] };
});
let runtimeExists = true;
try { const runtimeInfo = await lstat(runtime); if (!runtimeInfo.isDirectory() || runtimeInfo.isSymbolicLink()) throw new Error("B4B DSH runtime root is invalid."); }
catch (error) { if (error?.code !== "ENOENT") throw error; runtimeExists = false; await mkdir(runtime); }
if (runtimeExists) await validateDshRuntimeSource(source, runtime);
else for (const { mode, relative } of parsedRecords) {
  const from = path.join(source, ...relative.split("/")), to = path.join(runtime, ...relative.split("/"));
  await mkdir(path.dirname(to), { recursive: true });
  if (mode === "120000") { const target = await readlink(from); const destinationKind = (await stat(from)).isDirectory() ? "dir" : "file"; await symlink(target, to, destinationKind); }
  else await copyFile(from, to);
}
const buildRecordPath = path.join(buildSource, ".dsh-build", "client-build-environment.json");
if (buildRecord.formatVersion !== 1) throw new Error("B4B DSH client build record version is invalid.");
for (const relative of ["node_modules", ".dsh-build", "apps/web/dist"]) {
  await copyOrVerifyTree(path.join(buildSource, relative), path.join(runtime, relative));
}
const packageRoots = new Set(parsedRecords.filter(({ relative }) => relative.startsWith("packages/") && relative.endsWith("/package.json")).map(({ relative }) => path.dirname(relative)));
for (const relative of packageRoots) {
  const from = path.join(buildSource, relative, "lib"), to = path.join(runtime, relative, "lib");
  try { await copyOrVerifyTree(from, to); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
}
const runtimeInfo = await lstat(runtime);
if (!runtimeInfo.isDirectory() || runtimeInfo.isSymbolicLink() || await lstat(path.join(runtime, ".git")).then(() => true, (error) => error?.code === "ENOENT" ? false : Promise.reject(error))) throw new Error("B4B DSH runtime root is invalid.");
if ((await readFile(path.join(runtime, ".dsh-build", "client-build-environment.json"), "utf8")) !== await readFile(buildRecordPath, "utf8")) throw new Error("B4B DSH runtime build record differs from authority.");
const runtimeBuildRecord = JSON.parse(execFileSync(process.execPath, ["--import", "tsx/esm", "--input-type=module", "-e", "import { readClientBuildRecord } from './scripts/client-build-environment.ts'; console.log(JSON.stringify(readClientBuildRecord(process.cwd())));"], { cwd: runtime, encoding: "utf8", windowsHide: true }));
if (JSON.stringify(runtimeBuildRecord.artifacts) !== JSON.stringify(buildRecord.artifacts) || runtimeBuildRecord.environment?.DSH_CLIENT_COMMIT_HASH !== buildRecord.environment?.DSH_CLIENT_COMMIT_HASH) throw new Error("B4B DSH runtime build verification differs from build workspace.");
const result = await validateDshRuntimeSource(source, runtime);
console.log(JSON.stringify({ result: "PASS", b4bRunId: runId, sourceCommit: identity.commit, sourceTree: identity.tree, runtimeSourceDir: result.runtimeSourceDir, trackedSourceFileCount: result.trackedSourceFileCount, buildArtifactSha256: buildRecord.artifacts.sha256, buildArtifactFileCount: buildRecord.artifacts.fileCount, packageDependencyRoots: packageRoots.size }));
