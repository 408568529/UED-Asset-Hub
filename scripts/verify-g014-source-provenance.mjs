import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createControlledSourceSnapshot } from "./create-controlled-source-snapshot.mjs";
import { sourcePolicy, validateSourceClassificationInput, validateSourceSnapshotManifest } from "./windows-release-constructor.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const run = async (command, args, cwd) => {
  const { spawn } = await import("node:child_process");
  await new Promise((resolve, reject) => { const child = spawn(command, args, { cwd, stdio: "ignore" }); child.on("error", reject); child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} failed (${code})`))); });
};

const root = await mkdtemp(path.join(os.tmpdir(), "ued-g014-"));
try {
  const source = path.join(root, "source"); const output = path.join(root, "snapshot");
  await mkdir(source); await run("git", ["init", "-q"], source); await run("git", ["config", "user.email", "g014@example.invalid"], source); await run("git", ["config", "user.name", "G014"], source);
  await writeFile(path.join(source, "package-lock.json"), '{"lockfileVersion":3}\n'); await writeFile(path.join(source, "tracked.txt"), "base\n"); await run("git", ["add", "."], source); await run("git", ["commit", "-qm", "fixture"], source);
  await writeFile(path.join(source, "tracked.txt"), "changed\n"); await writeFile(path.join(source, "new-source.js"), "export default 1;\n");
  const snapshot = await createControlledSourceSnapshot({ sourceRoot: source, outputDir: output, creationRunId: "g014-fixture", createdAt: "2026-09-16T00:00:00.000Z" });
  const values = { "source-classification": "SNAPSHOT_WITH_UNCOMMITTED_CHANGES", "source-snapshot-manifest": snapshot.manifestPath, "source-snapshot-manifest-sha256": snapshot.manifestSha256, "source-commit": snapshot.manifest.sourceCommit, "source-archive-sha256": snapshot.archiveSha256, "creation-run-id": "g014-fixture" };
  const validated = await validateSourceSnapshotManifest(values);
  assert.equal(validated.policy.productionEligible, false); assert.equal(validated.expectedLockfileSha256, sha256(await readFile(path.join(source, "package-lock.json"))));
  assert.throws(() => sourcePolicy("UNKNOWN"), /unsupported/);
  assert.throws(() => validateSourceClassificationInput({ "source-classification": "SNAPSHOT_WITH_UNCOMMITTED_CHANGES", "production-promotion": "true", "source-snapshot-manifest": "fixture", "source-snapshot-manifest-sha256": "a".repeat(64) }), /not eligible/);
  assert.throws(() => validateSourceClassificationInput({ "source-classification": "COMMITTED_CLEAN_SOURCE" }), /snapshot manifest identity/);
  assert.equal(validateSourceClassificationInput({ "source-classification": "R3_TEST_ONLY_NOT_RELEASE_PROVENANCE" }).productionEligible, false);
  assert.equal(validateSourceClassificationInput({ "source-classification": "COMMITTED_CLEAN_SOURCE", "source-snapshot-manifest": "fixture", "source-snapshot-manifest-sha256": "a".repeat(64) }).productionEligible, true);
  process.stdout.write("G-014 source provenance contract: PASS\n");
} finally { await rm(root, { recursive: true, force: true }); }
