import { readFile, lstat, realpath, mkdir, cp, rename } from "node:fs/promises";
import path from "node:path";
import { parseStrictJson, hash } from "./release-json-contract.mjs";
import { assertCandidateExecutionEvidence } from "./release-provenance.mjs";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { assertExecutionBinding } from "./release-execution-binding.mjs";
import { assertPermittedExecution } from "./release-authority-approval.mjs";
import { assertTrustedAdmission, assertTrustedHistoricalRoots } from "./release-approval-store.mjs";
import { compareReleaseByteTrees, calculateCompleteByteTreeInventory } from "./release-byte-comparison.mjs";
import { inventoryHistoricalRoots, assertHistoricalPreservation, assertExecutionRootsPreserveHistory } from "./release-history-inventory.mjs";
export function assertSerialReleasePair(a, b) {
  if (a.approval.approvalIdentity !== b.approval.approvalIdentity || a.authority.inputAuthorityIdentity !== b.authority.inputAuthorityIdentity || canonicalJson(a.authority) !== canonicalJson(b.authority) || canonicalJson(a.authority.security) !== canonicalJson(b.authority.security) || a.binding.executionRunId === b.binding.executionRunId || a.bindingSha256 === b.bindingSha256 || a.binding.candidateLabel !== "A" || b.binding.candidateLabel !== "B" || a.binding.locators.canonicalWorkspace !== b.binding.locators.canonicalWorkspace) throw new Error("Serial A/B identity/security/workspace contract");
  for (const item of [a, b]) {
    assertPermittedExecution({ approval: item.approval, plan: item.plan, bindingBytes: item.bindingBytes, executionRunId: item.binding.executionRunId, candidateLabel: item.binding.candidateLabel, phase: item.binding.permission.expectedPhase });
    assertExecutionBinding(item.binding, item.expected);
  }
  return true;
}
// Dependency injection is orchestration, never permission. Both admissions must already come from explicitly selected operator records.
export async function runSerialReleasePair({ a, b, approvedHistoryRoots, execute, seal, journal }) {
  for (const item of [a, b]) {
    assertTrustedAdmission(item.admission, item.authority);
    if (item.approval !== item.admission.approval || item.plan !== item.admission.plan || item.binding !== item.admission.binding || sha256(item.bindingBytes) !== item.bindingSha256) throw new Error("Serial selection differs from trusted admission");
  }
  assertSerialReleasePair(a, b);
  if (![execute, seal, journal].every((fn) => typeof fn === "function")) throw new Error("Serial execution/seal/journal required");
  assertTrustedHistoricalRoots(approvedHistoryRoots);
  for (const item of [a, b]) assertExecutionRootsPreserveHistory(item.binding, approvedHistoryRoots);
  const before = await inventoryHistoricalRoots(approvedHistoryRoots);
  const results = [];
  try {
    for (const item of [a, b]) {
      await journal({ event: "started", executionRunId: item.binding.executionRunId, candidateLabel: item.binding.candidateLabel });
      const result = await execute(item);
      const sealed = await seal(item, result);
      await assertSealedSerialOutput(item, sealed);
      // B only starts after A Candidate, runtime, and execution evidence have been sealed.
      results.push(sealed);
      await journal({ event: "sealed", executionRunId: item.binding.executionRunId, candidateLabel: item.binding.candidateLabel, evidenceIdentity: sealed.evidenceIdentity });
      if (item === a) {
        const owner = parseStrictJson(await readFile(path.join(item.binding.locators.tempRoot, ".ued-r3-owner.json")));
        if (owner.executionRunId !== item.binding.executionRunId) throw new Error("Serial transient workspace owner mismatch");
        const retained = path.join(item.binding.locators.evidenceRoot, "retained-workspace-" + item.binding.executionRunId);
        try { await lstat(retained); throw new Error("Retained workspace destination exists"); } catch (error) { if (error.code !== "ENOENT") throw error; }
        await rename(item.binding.locators.tempRoot, retained);
      }
    }
    for (let i = 0; i < results.length; i++) await assertSealedSerialOutput([a, b][i], results[i]);
    await compareReleaseByteTrees(results[0].candidateRoot, results[1].candidateRoot);
    await compareReleaseByteTrees(results[0].runtimeRoot, results[1].runtimeRoot);
    assertHistoricalPreservation(before, await inventoryHistoricalRoots(approvedHistoryRoots));
    return results;
  } catch (error) {
    let preservationError = null;
    try { assertHistoricalPreservation(before, await inventoryHistoricalRoots(approvedHistoryRoots)); } catch (failure) { preservationError = failure.message; }
    await journal({ event: "failed", error: error.message, preservationError, retained: true });
    throw error;
  }
  // There is deliberately no cleanup/finally-delete path. Fresh B workspace preparation occurs only after A seal.
}

export async function sealSerialReleaseOutput(item, result) {
  const runtimeRoot = path.join(item.binding.locators.evidenceRoot, "runtime-snapshot-" + item.binding.executionRunId);
  await mkdir(runtimeRoot); // Exclusive directory: a failed attempt remains available for diagnosis.
  for (const name of [".next", "node_modules"]) await cp(path.join(item.binding.locators.canonicalWorkspace, name), path.join(runtimeRoot, name), { recursive: true, errorOnExist: true, force: false });
  const evidenceBytes = await readFile(result.executionEvidencePath);
  const sealed = { candidateRoot: result.destination, runtimeRoot, evidencePath: result.executionEvidencePath, evidenceIdentity: sha256(evidenceBytes), candidateInventorySha256: (await calculateCompleteByteTreeInventory(result.destination)).sha256, runtimeInventorySha256: (await calculateCompleteByteTreeInventory(runtimeRoot)).sha256 };
  await assertSealedSerialOutput(item, sealed); return sealed;
}
export async function assertSealedSerialOutput(item, sealed) {
  if (!sealed) throw new Error("Serial output seal missing");
  for (const key of ["evidenceIdentity", "candidateInventorySha256", "runtimeInventorySha256"]) hash(sealed[key], "Serial seal " + key);
  for (const [key, parent] of [["candidateRoot", item.binding.locators.outputRoot], ["runtimeRoot", item.binding.locators.evidenceRoot], ["evidencePath", item.binding.locators.evidenceRoot]]) {
    const relative = path.relative(parent, sealed[key]); if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || await realpath(sealed[key]) !== path.resolve(sealed[key])) throw new Error("Serial sealed locator " + key);
  }
  const bytes = await readFile(sealed.evidencePath), evidence = parseStrictJson(bytes);
  if (sha256(bytes) !== sealed.evidenceIdentity || evidence.schemaVersion !== 3) throw new Error("Serial execution evidence raw seal/version");
  const { verifyRelease } = await import("./windows-deployment-contract.mjs");
  const verified = await verifyRelease(sealed.candidateRoot, { version: item.authority.dsh.version, commit: item.authority.dsh.commit, sourceFingerprint: item.authority.dsh.fingerprint }, { authority: item.authority, admissionContext: item.admission, requireLiveAuthority: true });
  const source = item.admission.selectedReceipts.sourceManifestSha256;
  assertCandidateExecutionEvidence(evidence, { sourceCreationReceiptSha256: item.authority.receipts.sourceCreationReceiptSha256, creatorRunId: source.creationRunId, releaseIdentity: verified.releaseProvenance.releaseIdentity, authorizationId: item.authority.security.authorizationId, securitySetId: item.authority.security.securitySetId, candidateDigest: verified.manifest.artifactSet.digest, approvalIdentity: item.approval.approvalIdentity, logicalReleaseAuthoritySha256: item.approval.logicalReleaseAuthoritySha256, executionPlanIdentity: item.plan.planIdentity, experimentPermissionDigest: item.plan.permissionDigest, journalIdentity: item.binding.permission.journalIdentity, experimentId: item.binding.experimentId, executionRunId: item.binding.executionRunId, candidateLabel: item.binding.candidateLabel, inputAuthorityIdentity: item.authority.inputAuthorityIdentity, executionBindingSha256: item.bindingSha256, phase: item.binding.permission.expectedPhase, receiptHashes: item.binding.receipts, nativeRunBindingSha256: item.binding.bindings.nativeRunBindingSha256, dshMode: item.binding.bindings.dshMode, dshRunBindingSha256: item.binding.bindings.dshRunBindingSha256 });
  const candidate = await calculateCompleteByteTreeInventory(sealed.candidateRoot), runtime = await calculateCompleteByteTreeInventory(sealed.runtimeRoot);
  const next = await calculateCompleteByteTreeInventory(path.join(sealed.runtimeRoot, ".next")), dependencies = await calculateCompleteByteTreeInventory(path.join(sealed.runtimeRoot, "node_modules"));
  const observedRuntime = sha256(Buffer.from(canonicalJson({ next: next.sha256, dependencies: dependencies.sha256 })));
  if (candidate.sha256 !== sealed.candidateInventorySha256 || runtime.sha256 !== sealed.runtimeInventorySha256 || evidence.observations.candidateInventorySha256 !== candidate.sha256 || evidence.observations.runtimeInventorySha256 !== observedRuntime) throw new Error("Serial sealed raw inventory mismatch");
}
