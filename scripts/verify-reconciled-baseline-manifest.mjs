import assert from "node:assert/strict";
import { canonicalizeFixtures, collectBaselineRecords, baselineRequirements } from "./reconciled-baseline-manifest.mjs";

const fixture = (extra = {}) => ({ relativePath: "src/example.ts", sha256: "a".repeat(64), size: 1, physicalPath: "/isolated/src/example.ts", closureMembership: ["APPLICATION_REQUIRED"], ...extra });
const merged = canonicalizeFixtures([fixture(), fixture({ closureMembership: ["CONSTRUCTOR_STATIC"] })]);
assert.equal(merged.length, 1); assert.deepEqual(merged[0].closureMembership, ["APPLICATION_REQUIRED", "CONSTRUCTOR_STATIC"]);
assert.throws(() => canonicalizeFixtures([fixture(), fixture({ sha256: "b".repeat(64) })]));
assert.throws(() => canonicalizeFixtures([fixture(), fixture({ physicalPath: "/other/example.ts" })]));
assert.throws(() => canonicalizeFixtures([fixture(), fixture({ relativePath: "src/EXAMPLE.ts" })]));
assert.throws(() => canonicalizeFixtures([fixture({ relativePath: "../escape.ts" })]));
const collected = await collectBaselineRecords(process.cwd());
assert.equal(collected.records.length, new Set(collected.records.map((record) => record.relativePath)).size);
assert.ok(baselineRequirements.sourceRequired.every((path) => collected.records.some((record) => record.relativePath === path)));
assert.ok(baselineRequirements.applicationRequired.every((path) => collected.records.some((record) => record.relativePath === path)));
console.log(JSON.stringify({ result: "PASS", duplicateProvenance: collected.provenance, sourceFileRecordCount: collected.records.length }, null, 2));
