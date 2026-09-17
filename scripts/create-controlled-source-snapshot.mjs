import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "./release-artifact-tree.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
export const releaseSourceExclusions = [/^(?:\.git|\.next|node_modules|data|logs|evidence|runtime|tmp|temp|cache|staging)(?:\/|$)/i, /^tsconfig\.tsbuildinfo$/i, /(?:^|\/)\.env(?!\.example$)/i, /(?:^|\/)(?:.*\.(?:pem|key)|id_rsa)$/i];
export const isReleaseSourceExcluded = (relativePath) => releaseSourceExclusions.some((rule) => rule.test(relativePath));

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout = []; const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk)); child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(Buffer.concat(stdout)) : reject(new Error(`${command} failed (${code}): ${Buffer.concat(stderr).toString("utf8")}`)));
  });
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]; const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || values[key.slice(2)]) throw new Error("snapshot arguments are invalid.");
    values[key.slice(2)] = value;
  }
  for (const key of ["source-root", "output-dir", "creation-run-id", "source-classification"]) if (!values[key]) throw new Error(`missing --${key}`);
  return values;
}

async function git(root, args) { return run("git", args, { cwd: root }); }

export async function createControlledSourceSnapshot({ sourceRoot, outputDir, creationRunId, sourceClassification = "SNAPSHOT_WITH_UNCOMMITTED_CHANGES", createdAt = new Date().toISOString() }) {
  if (!["COMMITTED_CLEAN_SOURCE", "SNAPSHOT_WITH_UNCOMMITTED_CHANGES"].includes(sourceClassification)) throw new Error("source classification is invalid.");
  const root = await realpath(sourceRoot);
  const output = path.resolve(outputDir);
  const outputRelative = path.relative(root, output);
  if (!outputRelative || (!outputRelative.startsWith("..") && !path.isAbsolute(outputRelative))) throw new Error("snapshot output must be outside the source root.");
  const sourceCommit = (await git(root, ["rev-parse", "HEAD"])).toString("utf8").trim();
  if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error("source HEAD identity is invalid.");
  const cleanSource = sourceClassification === "COMMITTED_CLEAN_SOURCE";
  if (cleanSource) {
    await git(root, ["diff", "--quiet"]);
    await git(root, ["diff", "--cached", "--quiet"]);
    const untracked = (await git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).toString("utf8").split("\0").filter(Boolean).filter((relativePath) => !isReleaseSourceExcluded(relativePath));
    if (untracked.length) throw new Error("COMMITTED_CLEAN_SOURCE generation denied: untracked release source exists.");
  }
  const candidateArgs = cleanSource ? ["ls-files", "--cached", "-z"] : ["ls-files", "--cached", "--modified", "--others", "--exclude-standard", "-z"];
  const candidates = [...new Set((await git(root, candidateArgs)).toString("utf8").split("\0").filter(Boolean))].sort(compareUtf8);
  const included = []; const exclusions = [];
  for (const relativePath of candidates) {
    if (isReleaseSourceExcluded(relativePath)) { exclusions.push({ relativePath, reason: "policy-excluded" }); continue; }
    const absolute = path.join(root, ...relativePath.split("/")); const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1) throw new Error(`snapshot input must be a regular file: ${relativePath}`);
    const tracked = (await git(root, ["ls-files", "--error-unmatch", "--", relativePath]).then(() => true, () => false));
    included.push({ relativePath, fileType: "file", size: info.size, sha256: sha256(await readFile(absolute)), classification: tracked ? "tracked" : "untracked", includedReason: "release-relevant-worktree" });
  }
  if (!included.some((file) => file.relativePath === "package-lock.json")) throw new Error("snapshot must include package-lock.json.");
  await mkdir(output, { recursive: true });
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ued-source-snapshot-"));
  const listFile = path.join(temporary, "files.list"); const archive = path.join(output, "source-snapshot.tar"); const manifestPath = path.join(output, "source-snapshot-manifest.json");
  try {
    await writeFile(listFile, included.map((file) => file.relativePath).join("\n") + "\n", "utf8");
    await run("tar", ["--format=ustar", "-cf", archive, "-T", listFile], { cwd: root });
    const archiveSha256 = sha256(await readFile(archive));
    const trackedDiffSha256 = cleanSource ? sha256(Buffer.alloc(0)) : sha256(Buffer.concat([await git(root, ["diff", "--binary", "HEAD"]), await git(root, ["diff", "--cached", "--binary"])]));
    const untrackedInventorySha256 = cleanSource ? sha256(Buffer.from("[]", "utf8")) : sha256(Buffer.from(canonicalJson(included.filter((file) => file.classification === "untracked").map((file) => ({ relativePath: file.relativePath, size: file.size, sha256: file.sha256 }))), "utf8"));
    const workingTreeManifestSha256 = sha256(Buffer.from(canonicalJson(included.map((file) => ({ relativePath: file.relativePath, size: file.size, sha256: file.sha256, classification: file.classification }))), "utf8"));
    const manifest = { schemaVersion: 1, sourceClassification, productionEligible: cleanSource, sourceCommit, sourceArchiveSha256: archiveSha256, workingTreeManifestSha256, trackedDiffSha256, untrackedInventorySha256, creationRunId, createdAt, sourceRootIdentity: sha256(Buffer.from(root, "utf8")), files: included, exclusions };
    await writeFile(manifestPath, `${canonicalJson(manifest)}\n`, "utf8");
    return { archive, archiveSha256, manifestPath, manifestSha256: sha256(await readFile(manifestPath)), manifest };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const values = parseArgs(process.argv.slice(2));
    const result = await createControlledSourceSnapshot({ sourceRoot: values["source-root"], outputDir: values["output-dir"], creationRunId: values["creation-run-id"], sourceClassification: values["source-classification"] });
    process.stdout.write(`${canonicalJson({ archive: result.archive, sourceArchiveSha256: result.archiveSha256, manifest: result.manifestPath, sourceSnapshotManifestSha256: result.manifestSha256 })}\n`);
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
