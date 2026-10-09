import assert from "node:assert/strict";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { identity } from "./release-json-contract.mjs";
import { receiptKeys, permissionCoreIdentity } from "./release-authority-approval.mjs";
import { assertExecutionBinding, createExecutionBinding } from "./release-execution-binding.mjs";
import { assertSerialReleasePair, runSerialReleasePair } from "./release-serial-runner.mjs";
const h = (value) => sha256(Buffer.from(value));
const receipts = Object.fromEntries(receiptKeys.map((key) => [key,h(key)]));
const authority = { inputAuthorityIdentity: h("fixture-core"), security: { securitySetId: "fixture-shared" } };
const approval = { approvalIdentity: h("fixture-approval"), inputAuthorityIdentity: authority.inputAuthorityIdentity, logicalReleaseAuthoritySha256: h("fixture-lra"), approvedReceipts: receipts };
const plan = { schemaVersion: 1, approvalIdentity: approval.approvalIdentity, logicalReleaseAuthoritySha256: approval.logicalReleaseAuthoritySha256, experimentId: "isolated-serial", executions: ["A","B"].map((label) => ({ executionRunId: "fixture-" + label, candidateLabel: label, bindingSha256: h("pending"), phase: "fixture", labelBudget: 1, resumePolicy: "never", journalIdentity: h("pending") })) };
plan.permissionDigest = permissionCoreIdentity(plan);
const journalIdentity = identity({ schemaVersion: 1, experimentId: plan.experimentId, labelBudget: 1, experimentPermissionDigest: plan.permissionDigest });
const root = "C:\\isolated-serial";
const items = plan.executions.map((execution) => {
  execution.journalIdentity = journalIdentity;
  const expected = { experimentId: plan.experimentId, executionRunId: execution.executionRunId, candidateLabel: execution.candidateLabel, inputAuthorityIdentity: authority.inputAuthorityIdentity, phase: "fixture", receipts, bindings: { nativeRunBindingSha256: h(execution.executionRunId), dshMode: "bundle", dshRunBindingSha256: null }, journal: { identity: journalIdentity, executionRunId: execution.executionRunId, completedPhase: null, usedBudget: 0 } };
  const binding = createExecutionBinding({ schemaVersion: 1, experimentId: plan.experimentId, executionRunId: execution.executionRunId, candidateLabel: execution.candidateLabel, inputAuthorityIdentity: authority.inputAuthorityIdentity, receipts, bindings: expected.bindings, locators: { stagingRoot: root, tempRoot: root + "\\temp", canonicalWorkspace: root + "\\temp\\workspace", outputRoot: root + "\\output-" + execution.candidateLabel, evidenceRoot: root + "\\evidence-" + execution.candidateLabel, sourceArtifact: root + "\\frozen\\source.tar", nativeRoot: root + "\\frozen\\native", dshMaterializationRoot: root + "\\dsh-" + execution.candidateLabel, toolchainRoot: root + "\\tools", securityArtifact: root + "\\frozen\\security.bin" }, permission: { experimentPermissionDigest: plan.permissionDigest, labelBudget: 1, resumePolicy: "never", expectedPhase: "fixture", journalIdentity } }, expected);
  const bindingBytes = Buffer.from(canonicalJson(binding) + "\n"); execution.bindingSha256 = sha256(bindingBytes);
  return { authority, approval, plan, binding, bindingBytes, bindingSha256: sha256(bindingBytes), expected };
});
plan.planIdentity = identity(plan);
assertSerialReleasePair(...items);
for (const changed of [ { approval: { ...approval, approvalIdentity: h("other") } }, { authority: { ...authority, security: { securitySetId: "other" } } }, { bindingSha256: items[0].bindingSha256 }, { binding: { ...items[1].binding, executionRunId: items[0].binding.executionRunId } }, { binding: { ...items[1].binding, locators: { ...items[1].binding.locators, canonicalWorkspace: root + "\\different" } } } ]) assert.throws(() => assertSerialReleasePair(items[0], { ...items[1], ...changed }));
for (const key of ["sourceArtifact", "nativeRoot", "toolchainRoot", "securityArtifact", "dshMaterializationRoot"]) {
  assert.throws(() => assertExecutionBinding({ ...items[0].binding, locators: { ...items[0].binding.locators, [key]: items[0].binding.locators.evidenceRoot + "\\overlap" } }, items[0].expected), /overlaps selected input/u);
}
let invoked = false;
await assert.rejects(runSerialReleasePair({ a: { ...items[0], admission: {} }, b: { ...items[1], admission: {} }, approvedHistoryRoots: {}, execute: () => { invoked = true; } }), /Trusted/u);
assert.equal(invoked, false);
process.stdout.write(JSON.stringify({ result: "PASS", checks: 12, scope: "isolated pair selection and forged admission rejection; no live serial execution" }) + "\n");
