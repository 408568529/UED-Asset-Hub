import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateFrozenSourceManifest, assertFrozenSourceReceipt } from "./frozen-source-authority.mjs";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
if (process.argv.length !== 4) throw new Error("Usage: node verify-frozen-source-authority.mjs <original manifest> <original archive> (read-only)");
const manifestBytes = await readFile(process.argv[2]), archiveBytes = await readFile(process.argv[3]);
const { manifest, projection } = validateFrozenSourceManifest(manifestBytes, archiveBytes);
const receipt = { schemaVersion: 1, kind: "FrozenSourceAuthority", source: projection, baseTree: manifest.baseTree, archiveSize: archiveBytes.length, frozenSourceIdentity: manifest.frozenSourceIdentity, artifactCreation: { creatorRunId: manifest.creationRunId, createdAt: manifest.createdAt } };
assertFrozenSourceReceipt(receipt, { manifestBytes, archiveBytes, source: projection });
let checks = 2;
for (const change of [{ unknown: true }, { creationRunId: "" }, { createdAt: "invalid" }, { workingTreeManifestSha256: "0".repeat(64) }, { untrackedInventorySha256: "0".repeat(64) }, { sourceArchiveSha256: "0".repeat(64) }, { archiveMetadataPolicy: { ...manifest.archiveMetadataPolicy, uid: 1 } }, { classificationSummary: { ...manifest.classificationSummary, include: manifest.classificationSummary.include + 1 } }, { frozenSourceIdentity: "0".repeat(64) }, { changeClassification: [{ ...manifest.changeClassification[0], disposition: "UNKNOWN" }, ...manifest.changeClassification.slice(1)] }]) {
  assert.throws(() => validateFrozenSourceManifest(Buffer.from(canonicalJson({ ...manifest, ...change }) + "\n"), archiveBytes)); checks++;
}
for (const change of [{ artifactCreation: { ...receipt.artifactCreation, creatorRunId: "current-constructor-run" } }, { artifactCreation: { ...receipt.artifactCreation, createdAt: "2026-09-30T00:00:00.000Z" } }, { archiveSize: archiveBytes.length + 1 }, { frozenSourceIdentity: "0".repeat(64) }]) {
  assert.throws(() => assertFrozenSourceReceipt({ ...receipt, ...change }, { manifestBytes, archiveBytes, source: projection })); checks++;
}
assert.equal(sha256(await readFile(process.argv[2])), sha256(manifestBytes)); assert.equal(sha256(await readFile(process.argv[3])), sha256(archiveBytes)); checks += 2;
process.stdout.write(JSON.stringify({ result: "PASS", checks, files: manifest.files.length, sourceManifestSha256: sha256(manifestBytes), sourceArchiveSha256: sha256(archiveBytes), scope: "read-only original V4 validation plus in-memory negative fixtures; no source receipt published" }) + "\n");
