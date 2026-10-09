import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { open, readFile, realpath, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { exact, identity, parseStrictJson } from "./release-json-contract.mjs";
import { loadTrustConfiguration, assertProtectedPath, currentSecurityPrincipal } from "./release-approval-store.mjs";
import { approvalPolicyVersion, receiptKeys, approvalRecordBytes, assertApprovalSelection, assertReleaseExecutionPermission } from "./release-authority-approval.mjs";
import { assertReleaseReceiptProjections } from "./release-receipt-contract.mjs";
import { assertNativeBuildReceiptSet, inspectNativeExecutable } from "./native-build-authority.mjs";
import { nativeComponentDefinitions, verifyFrozenNativeSet } from "./native-artifact-contract.mjs";
async function publish(root, name, bytes, config) {
  const target = path.join(root, name + ".json");
  const handle = await open(target, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await assertProtectedPath(target, config, "producer");
  if (!(await readFile(target)).equals(bytes)) throw new Error("Published protected bytes changed");
  return target;
}
// Explicit trusted-operator review command; execution consumers still never auto-create records.
export async function createReleaseAuthorityApproval(review) {
  exact(review, ["authorityPath", "receiptFiles", "sourceArchive", "nativeRoot"], "approval review packet");
  exact(review.receiptFiles, receiptKeys, "review receipt files");
  const config = await loadTrustConfiguration("producer");
  if (await currentSecurityPrincipal() !== config.operatorPrincipal) throw new Error("Configured trusted operator required");
  for (const file of [review.authorityPath, review.sourceArchive, review.nativeRoot, ...Object.values(review.receiptFiles)]) {
    if (!path.isAbsolute(file) || await realpath(file) !== path.resolve(file)) throw new Error("Review path must be absolute and canonical");
    if ([config.approvalRoot, config.permissionRoot].some((root) => file === root || file.startsWith(root + path.sep))) throw new Error("Review input overlaps trusted store");
  }
  const authorityBytes = await readFile(review.authorityPath), authority = parseStrictJson(authorityBytes), receiptBytes = {};
  for (const key of receiptKeys) receiptBytes[key] = await readFile(review.receiptFiles[key]);
  const body = { schemaVersion: 2, policyVersion: approvalPolicyVersion, logicalReleaseAuthoritySha256: sha256(authorityBytes), inputAuthorityIdentity: authority.inputAuthorityIdentity, approvedReceipts: authority.receipts, approvalProvenance: { method: "trusted-operator-review-v1", operatorPrincipal: config.operatorPrincipal, reviewedAt: new Date().toISOString() } };
  const record = { ...body, approvalIdentity: identity(body) };
  assertApprovalSelection(record, authorityBytes, receiptBytes);
  const projected = assertReleaseReceiptProjections(authority, receiptBytes, await readFile(review.sourceArchive));
  const native = await verifyFrozenNativeSet(review.nativeRoot);
  const manifestBytes = await readFile(path.join(review.nativeRoot, "native-components.manifest.json"));
  if (!manifestBytes.equals(receiptBytes.nativeManifestSha256) || native.set.digest !== authority.native.setDigest || native.manifest.nativeBuildId !== authority.native.nativeSetId) throw new Error("Review native actual aggregate");
  for (const input of native.manifest.nativeSourceInputs) { const frozen = projected.frozen.manifest.files.find((file) => file.relativePath === input.relativePath); if (!frozen || input.size !== frozen.size || input.sha256 !== frozen.sha256) throw new Error("Review native frozen source input"); }
  const actualMembers = [];
  for (const role of nativeComponentDefinitions) { const bytes = await readFile(path.join(review.nativeRoot, ...role.executableRelativePath.split("/"))); const inspection = inspectNativeExecutable(bytes); actualMembers.push({ path: role.executableRelativePath, size: bytes.length, sha256: sha256(bytes), inspection }); }
  assertNativeBuildReceiptSet(receiptBytes.nativeCreationReceiptSha256, { approvedSha256: authority.receipts.nativeCreationReceiptSha256, nativeManifest: native.manifest, actualMembers, sourceInputs: native.manifest.nativeSourceInputs });
  return { approvalIdentity: record.approvalIdentity, path: await publish(config.approvalRoot, record.approvalIdentity, approvalRecordBytes(record), config) };
}
export async function publishReleaseExecutionPermission(plan) {
  assertReleaseExecutionPermission(plan);
  const config = await loadTrustConfiguration("producer");
  const bytes = Buffer.from(canonicalJson(plan) + "\n");
  // Selection refers to an explicitly published operator record. No implicit record creation.
  const { readApprovalRecord } = await import("./release-authority-approval.mjs");
  const approvalPath = path.join(config.approvalRoot, plan.approvalIdentity + ".json");
  await assertProtectedPath(approvalPath, config, "producer");
  const approval = readApprovalRecord(await readFile(approvalPath));
  if (approval.approvalIdentity !== plan.approvalIdentity || approval.logicalReleaseAuthoritySha256 !== plan.logicalReleaseAuthoritySha256 || approval.approvalProvenance.operatorPrincipal !== config.operatorPrincipal) throw new Error("Permission approved selection");
  if (process.platform !== "win32") throw new Error("Live permission journal provisioning requires Windows NTFS");
  const journalBody = { schemaVersion: 1, experimentId: plan.experimentId, labelBudget: 1, experimentPermissionDigest: plan.permissionDigest };
  const journalIdentity = identity(journalBody);
  if (plan.executions.some((execution) => execution.journalIdentity !== journalIdentity)) throw new Error("Permission journal header derivation");
  const journalRoot = path.join(config.permissionRoot, "journals");
  await mkdir(journalRoot, { recursive: true });
  await assertProtectedPath(journalRoot, config, "producer");
  const journalPath = path.join(journalRoot, journalIdentity + ".jsonl");
  const journal = await open(journalPath, "wx", 0o600);
  try { await journal.writeFile(canonicalJson({ ...journalBody, identity: journalIdentity }) + "\n"); await journal.sync(); } finally { await journal.close(); }
  await promisify(execFile)("C:\\Windows\\System32\\icacls.exe", [journalPath, "/inheritance:r", "/grant:r", "*" + config.operatorPrincipal + ":(F)", "*S-1-5-18:(F)", "*S-1-5-32-544:(F)"], { windowsHide: true });
  return publish(config.permissionRoot, plan.planIdentity, bytes, config);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: node create-release-authority-approval.mjs <absolute reviewed packet.json>");
  process.stdout.write(canonicalJson(await createReleaseAuthorityApproval(parseStrictJson(await readFile(process.argv[2])))) + "\n");
}

export async function publishHistoricalRootSelection(roots) {
  const config = await loadTrustConfiguration("producer");
  const { inventoryHistoricalRoots } = await import("./release-history-inventory.mjs");
  await inventoryHistoricalRoots(roots);
  return publish(config.permissionRoot, "historical-roots", Buffer.from(canonicalJson(roots) + "\n"), config);
}
