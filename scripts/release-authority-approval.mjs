import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { assertLogicalReleaseAuthority } from "./release-authority-contract.mjs";
import { exact, hash, identity, parseStrictJson } from "./release-json-contract.mjs";
export const approvalPolicyVersion = "ued-trusted-operator-release-v1";
export const receiptKeys = Object.freeze(["sourceManifestSha256", "sourceCreationReceiptSha256", "toolchainReceiptSha256", "environmentReceiptSha256", "dependencyReceiptSha256", "nativeManifestSha256", "nativeCreationReceiptSha256", "dshBundleAuthoritySha256", "dshProvenanceSha256", "securityProtectedArtifactSha256"]);
const approvalKeys = ["schemaVersion", "policyVersion", "approvalIdentity", "logicalReleaseAuthoritySha256", "inputAuthorityIdentity", "approvedReceipts", "approvalProvenance"];
export function assertReleaseAuthorityApproval(record) {
  exact(record, approvalKeys, "ReleaseAuthorityApproval");
  if (record.schemaVersion !== 2 || record.policyVersion !== approvalPolicyVersion) throw new Error("Approval policy/schema");
  for (const key of ["approvalIdentity", "logicalReleaseAuthoritySha256", "inputAuthorityIdentity"]) hash(record[key], key);
  exact(record.approvedReceipts, receiptKeys, "approvedReceipts"); for (const key of receiptKeys) hash(record.approvedReceipts[key], key);
  exact(record.approvalProvenance, ["method", "operatorPrincipal", "reviewedAt"], "approvalProvenance");
  const provenance = record.approvalProvenance;
  if (provenance.method !== "trusted-operator-review-v1" || !/^S-1-5-21-\d+-\d+-\d+-\d+$/u.test(provenance.operatorPrincipal || "") || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(provenance.reviewedAt || "") || !Number.isFinite(Date.parse(provenance.reviewedAt)) || new Date(provenance.reviewedAt).toISOString() !== provenance.reviewedAt) throw new Error("Approval provenance");
  const { approvalIdentity, ...body } = record;
  if (identity(body) !== approvalIdentity) throw new Error("Approval identity");
  return record;
}
export function approvalRecordBytes(record) { assertReleaseAuthorityApproval(record); return Buffer.from(canonicalJson(record) + "\n"); }
export function readApprovalRecord(bytes) {
  const record = assertReleaseAuthorityApproval(parseStrictJson(bytes));
  if (!Buffer.from(bytes).equals(approvalRecordBytes(record))) throw new Error("Approval raw serialization");
  return record;
}
// Pure membership validation grants no trusted-store status or execution permission.
export function assertApprovalSelection(record, authorityBytes, receiptBytes) {
  assertReleaseAuthorityApproval(record);
  if (sha256(authorityBytes) !== record.logicalReleaseAuthoritySha256) throw new Error("Approval LRA raw SHA");
  const authority = parseStrictJson(authorityBytes);
  assertLogicalReleaseAuthority(authority, { approvedRootSha256: identity(authority) });
  if (record.inputAuthorityIdentity !== authority.inputAuthorityIdentity || canonicalJson(record.approvedReceipts) !== canonicalJson(authority.receipts)) throw new Error("Approval LRA membership");
  assertApprovalReceiptBytes(record, receiptBytes);
  return authority;
}
// Pure raw membership check; domain validation and actual token admission remain separate.
export function assertApprovalReceiptBytes(record, receiptBytes) {
  assertReleaseAuthorityApproval(record);
  exact(receiptBytes, receiptKeys, "actual receipts");
  for (const key of receiptKeys) if (!Buffer.isBuffer(receiptBytes[key]) || sha256(receiptBytes[key]) !== record.approvedReceipts[key]) throw new Error("Approval actual receipt: " + key);
}
export function assertReleaseExecutionPermission(plan) {
  exact(plan, ["schemaVersion", "planIdentity", "permissionDigest", "approvalIdentity", "logicalReleaseAuthoritySha256", "experimentId", "executions"], "ReleaseExecutionPermission");
  if (plan.schemaVersion !== 1 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(plan.experimentId || "") || !Array.isArray(plan.executions) || !plan.executions.length) throw new Error("Execution permission identity");
  for (const key of ["planIdentity", "permissionDigest", "approvalIdentity", "logicalReleaseAuthoritySha256"]) hash(plan[key], key);
  const runs = new Set(), labels = new Set();
  for (const execution of plan.executions) {
    exact(execution, ["executionRunId", "candidateLabel", "bindingSha256", "phase", "labelBudget", "resumePolicy", "journalIdentity"], "permitted execution");
    hash(execution.bindingSha256, "bindingSha256"); hash(execution.journalIdentity, "journalIdentity");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(execution.executionRunId || "") || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(execution.phase || "") || !["A", "B", "single", "pre-r3"].includes(execution.candidateLabel) || execution.labelBudget !== 1 || execution.resumePolicy !== "never" || runs.has(execution.executionRunId) || labels.has(execution.candidateLabel)) throw new Error("Execution permission budget/run/phase");
    runs.add(execution.executionRunId); labels.add(execution.candidateLabel);
  }
  const { planIdentity, ...body } = plan;
  if (identity(body) !== planIdentity || permissionCoreIdentity(body) !== plan.permissionDigest) throw new Error("Execution permission digest");
  return plan;
}
export function assertPermittedExecution({ approval, plan, bindingBytes, executionRunId, candidateLabel, phase }) {
  assertReleaseExecutionPermission(plan);
  if (plan.approvalIdentity !== approval.approvalIdentity || plan.logicalReleaseAuthoritySha256 !== approval.logicalReleaseAuthoritySha256) throw new Error("Permission approval selection");
  const execution = plan.executions.find((item) => item.executionRunId === executionRunId);
  if (!execution || execution.candidateLabel !== candidateLabel || execution.phase !== phase || execution.bindingSha256 !== sha256(bindingBytes)) throw new Error("Permission execution selection");
  const binding = parseStrictJson(bindingBytes);
  if (binding.experimentId !== plan.experimentId || binding.executionRunId !== executionRunId || binding.candidateLabel !== candidateLabel || binding.inputAuthorityIdentity !== approval.inputAuthorityIdentity || canonicalJson(binding.receipts) !== canonicalJson(approval.approvedReceipts)) throw new Error("Permission binding membership");
  const expectedPermission = { experimentPermissionDigest: plan.permissionDigest, labelBudget: execution.labelBudget, resumePolicy: execution.resumePolicy, expectedPhase: execution.phase, journalIdentity: execution.journalIdentity };
  if (canonicalJson(binding.permission) !== canonicalJson(expectedPermission)) throw new Error("Permission binding phase/budget/journal");
  return { binding, execution };
}

// Permission is fixed before bindings are serialized. The complete protected plan then seals binding raw hashes.
export function permissionCoreIdentity(plan) {
  const { planIdentity: _plan, permissionDigest: _permission, ...body } = plan;
  return identity({ ...body, executions: body.executions.map(({ bindingSha256: _binding, journalIdentity: _journal, ...execution }) => execution) });
}
