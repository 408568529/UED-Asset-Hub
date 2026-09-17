import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
const safe = (p) => typeof p === "string" && p && !path.isAbsolute(p) && !path.win32.isAbsolute(p) && !p.includes("\\") && !p.split("/").some((x) => !x || x === "." || x === "..");
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

export async function createFrozenBaselineSnapshot({ sourceRoot, baselineManifestPath, outputDir, runId }) {
  const baselineBytes = await readFile(baselineManifestPath); const baselineSha = sha(baselineBytes); const baseline = JSON.parse(baselineBytes);
  if (!baseline.baselineId || !Array.isArray(baseline.sourceFiles) || new Set(baseline.sourceFiles.map((x) => x.relativePath)).size !== baseline.sourceFiles.length) throw new Error("frozen baseline manifest is not bijective.");
  const files = [];
  for (const entry of baseline.sourceFiles) {
    if (!safe(entry.relativePath)) throw new Error(`unsafe frozen baseline member: ${entry.relativePath}`);
    const absolute = path.join(sourceRoot, ...entry.relativePath.split("/")); const stat = await lstat(absolute); const bytes = await readFile(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || sha(bytes) !== entry.sha256 || bytes.length !== entry.size) throw new Error(`frozen baseline identity mismatch: ${entry.relativePath}`);
    files.push({ relativePath: entry.relativePath, sha256: entry.sha256, size: entry.size });
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), "ued-frozen-snapshot-")); await mkdir(outputDir, { recursive: true });
  const archive = path.join(outputDir, "source-snapshot.tar"); const manifestPath = path.join(outputDir, "source-snapshot-manifest.json");
  try {
    const list = path.join(temporary, "files.list"); await writeFile(list, files.map((x) => x.relativePath).join("\n") + "\n"); run("tar", ["--format=ustar", "-cf", archive, "-T", list], sourceRoot);
    const archiveSha = sha(await readFile(archive)); const manifest = { schemaVersion: 2, sourceClass: "SNAPSHOT_WITH_UNCOMMITTED_CHANGES", productionEligible: false, creationRunId: runId, baselineId: baseline.baselineId, baselineManifestSha256: baselineSha, sourceFileCount: files.length, snapshotMemberCount: files.length, snapshotArchiveSha256: archiveSha, packageLockSha256: baseline.identities.packageLockSha256, dshIdentity: baseline.identities.dshVersionSha256, nodeArtifactSidecarIdentity: baseline.identities.nodeAcquisitionSidecarSha256, files };
    const body = canonical(manifest) + "\n"; await writeFile(manifestPath, body); return { archive, archiveSha, manifestPath, manifestSha: sha(Buffer.from(body)), manifest };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
