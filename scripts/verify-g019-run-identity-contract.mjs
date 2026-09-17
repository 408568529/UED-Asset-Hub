import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ued-g019-"));
  const manifest = path.join(directory, "source-snapshot-manifest.json"); const runId = "r2g-g019-fixture";
  try {
    await writeFile(manifest, JSON.stringify({ creationRunId: runId }));
    const args = ["scripts/verify-g019-run-identity.mjs", "--snapshot-manifest", manifest, "--windows-run-id", runId, "--constructor-run-id", runId, "--evidence-run-id", runId];
    execFileSync(process.execPath, args, { stdio: "pipe" });
    assert.throws(() => execFileSync(process.execPath, [...args.slice(0, -1), "different-run"], { stdio: "pipe" }));
    console.log("[G-019] Run Identity local contract and mismatch rejection: PASS");
  } finally { await rm(directory, { recursive: true, force: true }); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
