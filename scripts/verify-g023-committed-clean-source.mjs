import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createControlledSourceSnapshot } from "./create-controlled-source-snapshot.mjs";
import { validateSourceSnapshotManifest } from "./windows-release-constructor.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const run = (cwd, args) => execFileSync("git", args, { cwd, stdio: "ignore" });
const runId = "r2g-g023-fixture";

async function createRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ued-g023-source-"));
  run(root, ["init"]); run(root, ["config", "user.email", "fixture@example.invalid"]); run(root, ["config", "user.name", "fixture"]);
  await writeFile(path.join(root, "package.json"), '{"name":"g023-fixture","version":"1.0.0"}\n');
  await writeFile(path.join(root, "package-lock.json"), '{"lockfileVersion":3,"packages":{}}\n');
  await writeFile(path.join(root, "required.txt"), "required\n");
  run(root, ["add", "package.json", "package-lock.json", "required.txt"]); run(root, ["commit", "-m", "fixture"]);
  return root;
}

async function expectDenied(action, pattern) {
  await assert.rejects(action, (error) => pattern.test(error instanceof Error ? error.message : String(error)));
}

async function valuesFor(manifest, output, filename = "candidate-manifest.json") {
  const manifestPath = path.join(output, filename);
  const bytes = Buffer.from(`${JSON.stringify(manifest)}\n`, "utf8");
  await writeFile(manifestPath, bytes);
  return { "source-classification": "COMMITTED_CLEAN_SOURCE", "source-snapshot-manifest": manifestPath, "source-snapshot-manifest-sha256": sha256(bytes), "source-commit": manifest.sourceCommit, "source-archive-sha256": manifest.sourceArchiveSha256, "creation-run-id": manifest.creationRunId };
}

async function main() {
  const root = await createRepository(); const output = await mkdtemp(path.join(os.tmpdir(), "ued-g023-output-"));
  try {
    const snapshot = await createControlledSourceSnapshot({ sourceRoot: root, outputDir: output, creationRunId: runId, sourceClassification: "COMMITTED_CLEAN_SOURCE", createdAt: "2026-09-17T00:00:00.000Z" });
    assert.equal(snapshot.manifest.sourceClassification, "COMMITTED_CLEAN_SOURCE");
    assert.equal(snapshot.manifest.productionEligible, true);
    assert.equal(snapshot.manifest.trackedDiffSha256, sha256(Buffer.alloc(0)));
    assert.equal(snapshot.manifest.untrackedInventorySha256, sha256(Buffer.from("[]", "utf8")));
    assert.ok(snapshot.manifest.files.every((file) => file.classification === "tracked"));
    const values = { "source-classification": "COMMITTED_CLEAN_SOURCE", "source-snapshot-manifest": snapshot.manifestPath, "source-snapshot-manifest-sha256": snapshot.manifestSha256, "source-commit": snapshot.manifest.sourceCommit, "source-archive-sha256": snapshot.archiveSha256, "creation-run-id": runId };
    await validateSourceSnapshotManifest(values);

    await writeFile(path.join(root, "required.txt"), "dirty\n");
    await expectDenied(() => createControlledSourceSnapshot({ sourceRoot: root, outputDir: output, creationRunId: runId, sourceClassification: "COMMITTED_CLEAN_SOURCE" }), /git failed/);
    run(root, ["checkout", "--", "required.txt"]);
    await writeFile(path.join(root, "required.txt"), "staged\n"); run(root, ["add", "required.txt"]);
    await expectDenied(() => createControlledSourceSnapshot({ sourceRoot: root, outputDir: output, creationRunId: runId, sourceClassification: "COMMITTED_CLEAN_SOURCE" }), /git failed/);
    run(root, ["reset", "--", "required.txt"]); run(root, ["checkout", "--", "required.txt"]);
    await writeFile(path.join(root, "untracked-release.txt"), "untracked\n");
    await expectDenied(() => createControlledSourceSnapshot({ sourceRoot: root, outputDir: output, creationRunId: runId, sourceClassification: "COMMITTED_CLEAN_SOURCE" }), /untracked release source/);
    await rm(path.join(root, "untracked-release.txt"));

    const malformed = { ...snapshot.manifest, sourceClassification: "SNAPSHOT_WITH_UNCOMMITTED_CHANGES" };
    await expectDenied(async () => validateSourceSnapshotManifest(await valuesFor(malformed, output, "wrong-classification.json")), /creation receipt or authority identity/);
    assert.equal((await validateSourceSnapshotManifest({ ...values, "creation-run-id": "different-run" })).snapshot.creationRunId, snapshot.manifest.creationRunId);
    await expectDenied(() => validateSourceSnapshotManifest({ ...values, "source-archive-sha256": "a".repeat(64) }), /creation receipt or authority identity/);
    await expectDenied(async () => validateSourceSnapshotManifest(await valuesFor({ ...snapshot.manifest, productionEligible: false }, output, "not-eligible.json")), /creation receipt or authority identity/);
    await expectDenied(async () => validateSourceSnapshotManifest(await valuesFor({ ...snapshot.manifest, trackedDiffSha256: "a".repeat(64) }, output, "dirty-diff.json")), /clean source classification requires/);
    await expectDenied(async () => validateSourceSnapshotManifest(await valuesFor({ ...snapshot.manifest, untrackedInventorySha256: "b".repeat(64) }, output, "untracked.json")), /untracked inventory identity/);
    await expectDenied(async () => validateSourceSnapshotManifest(await valuesFor({ ...snapshot.manifest, workingTreeManifestSha256: "c".repeat(64) }, output, "wrong-working-tree.json")), /working tree manifest identity/);
    await expectDenied(async () => validateSourceSnapshotManifest(await valuesFor({ ...snapshot.manifest, sourceRootIdentity: "" }, output, "missing-root.json")), /manifest hashes are invalid/);
    console.log("[G-023] COMMITTED_CLEAN_SOURCE generator, constructor validator compatibility, and negative cases: PASS");
  } finally { await rm(root, { recursive: true, force: true }); await rm(output, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
