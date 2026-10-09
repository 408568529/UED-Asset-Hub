import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createReleaseSecuritySet, materializeNextSecurityCache, releaseSecuritySetMetadata, validateReleaseSecuritySet, verifyNextSecurityAdoption, verifyNextSecurityCache } from "./release-security-set.mjs";
import { jsonDifference } from "./verify-windows-release-constructor.mjs";

const sourceCommit = "1".repeat(40);
const sourceArchiveSha256 = "2".repeat(64);
const authorizationId = "phase1-fixture-authorization";
const now = Date.now();
const options = { sourceCommit, sourceArchiveSha256, authorizationId, now, nextVersion: "15.5.19" };
const securitySet = createReleaseSecuritySet({ sourceCommit, sourceArchiveSha256, authorizationId, now });
const secretValues = [securitySet.previewModeId, securitySet.previewModeSigningKey, securitySet.previewModeEncryptionKey, securitySet.serverActionsEncryptionKey];
const failWith = (value, expected, override = {}) => assert.throws(() => validateReleaseSecuritySet(value, { ...options, ...override }), new RegExp(expected));

assert.equal(releaseSecuritySetMetadata(securitySet, options).securitySetId, securitySet.securitySetId);
const missingPreview = structuredClone(securitySet); delete missingPreview.previewModeId; failWith(missingPreview, "SECURITY_SET_INVALID");
const missingServerActions = structuredClone(securitySet); delete missingServerActions.serverActionsEncryptionKey; failWith(missingServerActions, "SECURITY_SET_INVALID");
const malformed = structuredClone(securitySet); malformed.previewModeSigningKey = "invalid"; failWith(malformed, "SECURITY_SET_INVALID");
const wrongSchema = { ...securitySet, schemaVersion: 2 }; failWith(wrongSchema, "SECURITY_SET_INVALID");
failWith(securitySet, "SECURITY_SET_INVALID", { nextVersion: "15.5.20" });
failWith(securitySet, "SECURITY_SET_INVALID", { now: securitySet.epoch.expiresAt });
failWith({ ...securitySet, epoch: { ...securitySet.epoch, expiresAt: securitySet.epoch.createdAt + 1 } }, "SECURITY_SET_INVALID", { now: securitySet.epoch.createdAt + 2 });

const root = await mkdtemp(path.join(os.tmpdir(), "ued-release-security-set-"));
try {
  const workspace = path.join(root, "workspace");
  await mkdir(path.join(workspace, ".next", "cache"), { recursive: true });
  await writeFile(path.join(workspace, ".next", "cache", "stale-input"), "old");
  const metadata = await materializeNextSecurityCache({ workspace, securitySet, ...options });
  assert.equal(metadata.securitySetId, securitySet.securitySetId);
  await assert.rejects(readFile(path.join(workspace, ".next", "cache", "stale-input")));
  assert.deepEqual(await verifyNextSecurityCache({ workspace, securitySet, options }), { securitySetId: securitySet.securitySetId, cacheInputsMatchAuthority: true });

  await writeFile(path.join(workspace, ".next", "prerender-manifest.json"), JSON.stringify({ preview: { previewModeId: securitySet.previewModeId, previewModeSigningKey: securitySet.previewModeSigningKey, previewModeEncryptionKey: securitySet.previewModeEncryptionKey } }));
  await mkdir(path.join(workspace, ".next", "server"), { recursive: true });
  await writeFile(path.join(workspace, ".next", "server", "server-reference-manifest.json"), JSON.stringify({ encryptionKey: securitySet.serverActionsEncryptionKey }));
  assert.deepEqual(await verifyNextSecurityAdoption({ workspace, securitySet, options }), { securitySetId: securitySet.securitySetId, previewAdopted: true, serverActionsAdopted: true });

  await writeFile(path.join(workspace, ".next", "cache", ".previewinfo"), "{}");
  await assert.rejects(verifyNextSecurityCache({ workspace, securitySet, options }), /SECURITY_CACHE_PREVIEW_MISMATCH/);
  await materializeNextSecurityCache({ workspace, securitySet, ...options });
  await writeFile(path.join(workspace, ".next", "cache", ".rscinfo"), "{}");
  await assert.rejects(verifyNextSecurityCache({ workspace, securitySet, options }), /SECURITY_CACHE_SERVER_ACTIONS_MISMATCH/);
  await materializeNextSecurityCache({ workspace, securitySet, ...options });
  await mkdir(path.join(workspace, ".next", "server"), { recursive: true });
  await writeFile(path.join(workspace, ".next", "server", "server-reference-manifest.json"), JSON.stringify({ encryptionKey: securitySet.serverActionsEncryptionKey }));
  await writeFile(path.join(workspace, ".next", "prerender-manifest.json"), JSON.stringify({ preview: { previewModeId: "0".repeat(32), previewModeSigningKey: securitySet.previewModeSigningKey, previewModeEncryptionKey: securitySet.previewModeEncryptionKey } }));
  await assert.rejects(verifyNextSecurityAdoption({ workspace, securitySet, options }), (error) => error.message === "SECURITY_MATERIAL_MISMATCH: preview" && !secretValues.some((secret) => error.message.includes(secret)));
  await writeFile(path.join(workspace, ".next", "prerender-manifest.json"), JSON.stringify({ preview: { previewModeId: securitySet.previewModeId, previewModeSigningKey: securitySet.previewModeSigningKey, previewModeEncryptionKey: securitySet.previewModeEncryptionKey } }));
  await writeFile(path.join(workspace, ".next", "server", "server-reference-manifest.json"), JSON.stringify({ encryptionKey: "not-authorized" }));
  await assert.rejects(verifyNextSecurityAdoption({ workspace, securitySet, options }), (error) => error.message === "SECURITY_MATERIAL_MISMATCH: server-actions" && !secretValues.some((secret) => error.message.includes(secret)));

  const ordinaryRecords = JSON.stringify({ metadata, log: "SECURITY_MATERIAL_MISMATCH", provenance: { securitySetId: metadata.securitySetId } });
  assert.equal(secretValues.some((secret) => ordinaryRecords.includes(secret)), false);
  const evidenceA = path.join(root, "evidence-a", ".next", "server");
  const evidenceB = path.join(root, "evidence-b", ".next", "server");
  await Promise.all([mkdir(evidenceA, { recursive: true }), mkdir(evidenceB, { recursive: true })]);
  const referencePath = "server-reference-manifest.json";
  await writeFile(path.join(evidenceA, referencePath), JSON.stringify({ encryptionKey: securitySet.serverActionsEncryptionKey }));
  await writeFile(path.join(evidenceB, referencePath), JSON.stringify({ encryptionKey: "fixture-different-material" }));
  const difference = await jsonDifference({ path: `.next/server/${referencePath}`, a: { path: "a" }, b: { path: "b" } }, path.join(root, "evidence-a"), path.join(root, "evidence-b"));
  const serializedDifference = JSON.stringify(difference);
  assert.equal(difference.a, "[REDACTED]");
  assert.equal(secretValues.some((secret) => serializedDifference.includes(secret)), false);
  process.stdout.write("[Release Security Set] authority, cache adapter, adoption, negative, and leakage checks: PASS\n");
} finally {
  await rm(root, { recursive: true, force: true });
}
