import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectBaselineRecords } from "./reconciled-baseline-manifest.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "ued-release-inventory-"));
try {
  execFileSync("git", ["clone", "--quiet", "--no-local", path.resolve("."), root]);
  await writeFile(path.join(root, "untracked-release-source.mjs"), "export default true;\n");
  await mkdir(path.join(root, "evidence", "nested"), { recursive: true }); await writeFile(path.join(root, "evidence", "nested", "verification.json"), "{}\n");
  const { records } = await collectBaselineRecords(root); const paths = records.map((record) => record.relativePath);
  assert.equal(paths.some((item) => item.startsWith("evidence/")), false); assert.equal(paths.includes("untracked-release-source.mjs"), true);
  console.log(JSON.stringify({ result: "PASS", evidenceReleaseSourceMembers: 0, untrackedReleaseSourceDetected: true }));
} finally { await rm(root, { recursive: true, force: true }); }
