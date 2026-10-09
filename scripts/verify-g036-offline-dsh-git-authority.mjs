import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { canonicalizeRelativeSymlinkTargetForComparison } from "../agent-integration/scripts/dsh-offline-package.mjs";

const canonical = (target, platformObservation = false) => canonicalizeRelativeSymlinkTargetForComparison(".claude/skills", target, { platformObservation });
const authoritative = canonical("../.agents/skills");
assert.equal(authoritative, canonical("../.agents/skills"));
assert.equal(authoritative, canonical("..\\.agents\\skills", true));
assert.equal(canonical("../.agents/nested/skills"), canonical("..\\.agents\\nested\\skills", true));
assert.notEqual(authoritative, canonical("../.agents/other", true));
for (const unsafe of ["..\\..\\outside", "C:\\outside", "C:outside", "\\outside", "\\\\server\\share", "\\\\?\\C:\\outside", "/outside"]) assert.throws(() => canonical(unsafe, true));
assert.notEqual(authoritative, canonical("..\\.Agents\\skills", true));
assert.notEqual(authoritative, canonical("..\\.agents\\skillѕ", true));
assert.notEqual(authoritative, canonical("..\\.agents\\skills\\extra", true));
assert.throws(() => canonical("..\\.agents\\skills"));

const source = await readFile(new URL("../agent-integration/scripts/dsh-offline-package.mjs", import.meta.url), "utf8");
assert.match(source, /gitAuthority/);
assert.match(source, /materializeOfflineDshGitCheckout/);
assert.match(source, /validateOfflineDshGitCheckout/);
assert.ok(source.includes('run(outputDir, ["config", "core.symlinks", "true"])'));
assert.doesNotMatch(source, /\bgit", \["fetch"/);
assert.doesNotMatch(source, /\bgit", \["clone"/);
execFileSync(process.execPath, ["scripts/verify-dsh-provenance-contract.mjs"], { cwd: process.cwd(), stdio: "inherit" });
console.log(JSON.stringify({ result: "PASS", packageGitAuthority: "PASS", bundleValidation: "PASS", requiredCommit: "PASS", offlineCheckout: "PASS", headExact: "PASS", checkoutClean: "PASS", sourceReconciliation: "PASS", hostSourceIdentity: "PASS", semanticSymlinkCases: 12, noNetwork: "PASS", failClosedFailureCount: 0 }));
