import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, lstat, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { exact } from "./release-json-contract.mjs";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
const exec = promisify(execFile);
export function assertReachableClosureReceipt(value) {
  exact(value, ["equal", "expectedCount", "actualCount", "missingCount", "extraCount", "missingSample", "extraSample"], "DSH closure receipt");
  if (value.equal !== true || !Number.isSafeInteger(value.expectedCount) || value.expectedCount < 1 || value.actualCount !== value.expectedCount || value.missingCount !== 0 || value.extraCount !== 0 || canonicalJson(value.missingSample) !== "[]" || canonicalJson(value.extraSample) !== "[]") throw new Error("DSH approved complete closure receipt");
}
export async function assertDshBundleAuthorityConsumption({ authority, dsh, bundlePath, sourceDir }) {
  assertReachableClosureReceipt(authority.bundle.reachableObjectClosure);
  assertReachableClosureReceipt(authority.emptyEnvironmentMaterialization.reachableObjectClosure);
  const bytes = await readFile(bundlePath);
  if (bytes.length !== authority.bundle.size || sha256(bytes) !== dsh.bundleSha256 || authority.bundle.format !== "# v2 git bundle" || authority.bundle.missingParentAvailable !== true) throw new Error("DSH actual approved bundle size/hash/format");
  const separator = bytes.indexOf(Buffer.from("\n\n"));
  if (separator < 0 || bytes.subarray(0, separator).toString().split("\n").some((line) => line.startsWith("-"))) throw new Error("DSH external bundle prerequisite");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/iu.test(key)));
  Object.assign(env, { GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null", GIT_ALLOW_PROTOCOL: "file", GIT_TERMINAL_PROMPT: "0", GIT_NO_REPLACE_OBJECTS: "1" });
  let gitExecutable = "git";
  if (process.platform === "win32") {
    const resolved = (await exec("C:\\Windows\\System32\\where.exe", ["git.exe"], { env, windowsHide: true })).stdout.split(/\r?\n/u).filter(Boolean)[0];
    const { loadTrustConfiguration, assertProtectedPath } = await import("./release-approval-store.mjs");
    const config = await loadTrustConfiguration();
    await assertProtectedPath(resolved, config); gitExecutable = resolved;
  }
  const git = async (args) => (await exec(gitExecutable, args, { env, maxBuffer: 128 * 1024 * 1024, windowsHide: true })).stdout;
  const closure = async (repository) => {
    const lines = (await git(["-C", repository, "rev-list", "--objects", "--missing=print", dsh.commit])).split(/\r?\n/u).filter(Boolean);
    if (lines.some((line) => line.startsWith("?"))) throw new Error("DSH reachable object missing");
    const ids = [...new Set(lines.map((line) => line.split(" ")[0]))].sort();
    if (ids.some((id) => !/^[a-f0-9]{40}$/u.test(id))) throw new Error("DSH object identity"); return ids;
  };
  if ((await git(["-C", sourceDir, "rev-parse", "--is-shallow-repository"])).trim() !== "false") throw new Error("DSH shallow materialization");
  const gitDir = (await git(["-C", sourceDir, "rev-parse", "--absolute-git-dir"])).trim();
  for (const name of ["shallow", "objects/info/alternates", "info/grafts"]) {
    try { await lstat(path.join(gitDir, ...name.split("/"))); throw new Error("DSH external/shallow/grafted object source"); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ued-dsh-authority-check-"));
  try {
    await git(["init", "--bare", "-q", temporary]); await git(["-C", temporary, "bundle", "verify", bundlePath]); await git(["-C", temporary, "bundle", "unbundle", bundlePath]);
    const materialized = await closure(sourceDir), bundled = await closure(temporary);
    if (canonicalJson(materialized) !== canonicalJson(bundled) || bundled.length !== authority.bundle.reachableObjectClosure.expectedCount || materialized.length !== authority.emptyEnvironmentMaterialization.reachableObjectClosure.expectedCount) throw new Error("DSH actual object sets differ from approved closure");
    const files = (await git(["-C", sourceDir, "ls-files", "-z"])).split("\0").filter(Boolean).sort((a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b)));
    const pathSetDigest = sha256(Buffer.from(files.join("\n") + "\n"));
    const recorded = authority.emptyEnvironmentMaterialization;
    const materializationDigest = sha256(Buffer.from(canonicalJson({ commit: dsh.commit, tree: dsh.tree, fingerprint: dsh.fingerprint, pathCount: files.length, pathSetDigest, clean: true })));
    if (files.length !== recorded.trackedFileCount || pathSetDigest !== recorded.pathSetDigest || materializationDigest !== recorded.materializationDigest) throw new Error("DSH actual materialization projection");
    return { objectCount: bundled.length, trackedFileCount: files.length, pathSetDigest, materializationDigest };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
