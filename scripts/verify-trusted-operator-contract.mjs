import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { identity, parseStrictJson } from "./release-json-contract.mjs";
import { approvalPolicyVersion, receiptKeys, readApprovalRecord, approvalRecordBytes, assertApprovalReceiptBytes } from "./release-authority-approval.mjs";
import { assertTrustConfiguration, assertTrustedOperatorObservation, assertPermissionObservation, assertJournalPermissionObservation, loadTrustConfiguration, assertTrustedAdmission } from "./release-approval-store.mjs";
import { parseReleasePhaseJournal, assertReleaseJournalHead } from "./windows-release-constructor.mjs";
let checks = 0;
const reject = (fn, pattern) => { assert.throws(fn, pattern); checks++; };
const sid = "S-1-5-21-1-2-3-1001", other = "S-1-5-21-1-2-3-1002";
const config = { schemaVersion: 2, policyVersion: approvalPolicyVersion, operatorPrincipal: sid, approvalRoot: path.resolve("operator-records"), permissionRoot: path.resolve("operator-permissions"), consumerCodeRoot: path.resolve("operator-code") };
assertTrustConfiguration(config); checks++;
reject(() => assertTrustConfiguration({ ...config, policyVersion: "ued-release-authority-approval-v1" }), /policy/u);
reject(() => assertTrustConfiguration({ ...config, approverPrincipal: sid }), /unknown/u);
reject(() => assertTrustConfiguration({ ...config, operatorPrincipal: "S-1-5-18" }), /SID/u);
reject(() => assertTrustConfiguration({ ...config, approvalRoot: config.consumerCodeRoot }), /overlaps/u);
reject(() => assertTrustConfiguration({ ...config, approvalRoot: config.consumerCodeRoot.toUpperCase() }), /overlaps/u);
reject(() => assertTrustConfiguration({ ...config, approvalRoot: path.join(config.consumerCodeRoot, "..", path.basename(config.consumerCodeRoot)) }), /overlaps/u);
reject(() => assertTrustConfiguration({ ...config, consumerCodeRoot: path.join(config.approvalRoot, "code") }), /overlaps/u);
const token = { principal: sid, account: "HOST\\Operator", resolvedAccount: "HOST\\Operator", isAdministrator: true, elevated: true, integrityLevel: 12288 };
assertTrustedOperatorObservation(token, config); checks++;
for (const change of [{ principal: other }, { account: "HOST\\Other" }, { resolvedAccount: "" }, { isAdministrator: false }, { elevated: false }, { elevated: 1 }, { integrityLevel: 8192 }, { integrityLevel: null }]) reject(() => assertTrustedOperatorObservation({ ...token, ...change }, config), /token/u);
const { elevated: omitted, ...missing } = token;
reject(() => assertTrustedOperatorObservation(missing, config), /missing/u);
reject(() => assertTrustedOperatorObservation({ ...token, callerApproved: true }, config), /unknown/u);
const permissions = { token, entries: [{ path: "C:\\ProgramData\\UED-Release-Authority\\trust-config.json", owner: sid, ownerAccount: "HOST\\Operator", unsafeLink: false, rules: [{ principal: sid, rights: 2032127, inheritOnly: false }] }] };
assertPermissionObservation(permissions, config); checks++;
for (const change of [{ owner: other }, { unsafeLink: true }, { rules: [{ principal: "S-1-1-0", rights: 2, inheritOnly: false }] }, { rules: [{ principal: "S-1-5-32-545", rights: 262144, inheritOnly: false }] }]) reject(() => assertPermissionObservation({ ...permissions, entries: [{ ...permissions.entries[0], ...change }] }, config), /permission/u);
const trustedInstaller = "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
const parent = { path: "C:\\ProgramData", owner: "S-1-5-18", ownerAccount: "NT AUTHORITY\\SYSTEM", unsafeLink: false, rules: [{ principal: "S-1-5-32-545", rights: 278, inheritOnly: false }] };
const root = { path: "C:\\", owner: trustedInstaller, ownerAccount: "NT SERVICE\\TrustedInstaller", unsafeLink: false, rules: [{ principal: "S-1-5-11", rights: 4, inheritOnly: false }, { principal: "S-1-5-11", rights: -536805376, inheritOnly: true }] };
assertPermissionObservation({ token, entries: [permissions.entries[0], parent, root] }, config); checks++;
for (const [entryIndex, change] of [
  [0, { rules: [{ principal: "S-1-5-32-545", rights: 2, inheritOnly: false }] }],
  [0, { rules: [{ principal: "S-1-5-32-545", rights: 262144, inheritOnly: false }] }],
  [1, { rules: [{ principal: "S-1-5-32-545", rights: 64, inheritOnly: false }] }],
  [1, { rules: [{ principal: "S-1-5-32-545", rights: 65536, inheritOnly: false }] }],
  [1, { rules: [{ principal: "S-1-5-32-545", rights: 524288, inheritOnly: false }] }],
  [2, { ownerAccount: "NT SERVICE\\Unknown" }],
  [2, { unsafeLink: true }],
]) {
  const entries = [permissions.entries[0], parent, root]; entries[entryIndex] = { ...entries[entryIndex], ...change };
  reject(() => assertPermissionObservation({ token, entries }, config), /permission/u);
}
assertPermissionObservation({ token, entries: [{ ...permissions.entries[0], rules: [{ principal: "S-1-5-32-545", rights: 2032127, inheritOnly: true }] }, parent, root] }, config); checks++;
assertJournalPermissionObservation({ owner: sid, unsafeLink: false, allows: [{ principal: sid, rights: 2032127 }] }, config); checks++;
reject(() => assertJournalPermissionObservation({ owner: sid, unsafeLink: false, allows: [{ principal: other, rights: 4 }] }, config), /writer/u);
reject(() => assertJournalPermissionObservation({ owner: sid, unsafeLink: false, allows: [{ principal: sid, rights: 1 }] }, config), /append/u);
reject(() => assertJournalPermissionObservation({ owner: sid, unsafeLink: true, allows: [{ principal: sid, rights: 2032127 }] }, config), /link/u);
const receipts = Object.fromEntries(receiptKeys.map((key) => [key, Buffer.from("isolated-" + key)]));
const body = { schemaVersion: 2, policyVersion: approvalPolicyVersion, logicalReleaseAuthoritySha256: sha256(Buffer.from("fixture-lra")), inputAuthorityIdentity: sha256(Buffer.from("fixture-core")), approvedReceipts: Object.fromEntries(receiptKeys.map((key) => [key, sha256(receipts[key])])), approvalProvenance: { method: "trusted-operator-review-v1", operatorPrincipal: sid, reviewedAt: "2026-10-09T00:00:00.000Z" } };
const record = { ...body, approvalIdentity: identity(body) };
assert.deepEqual(readApprovalRecord(approvalRecordBytes(record)), record); checks++;
assertApprovalReceiptBytes(record, receipts); checks++;
for (const key of receiptKeys) reject(() => assertApprovalReceiptBytes(record, { ...receipts, [key]: Buffer.from("swapped") }), new RegExp(key, "u"));
const legacy = { ...body, schemaVersion: 1, policyVersion: "ued-release-authority-approval-v1", approvalProvenance: { method: "controlled-approval-v1", approverPrincipal: sid, approvedAt: "2026-09-30T00:00:00.000Z" } };
reject(() => readApprovalRecord(Buffer.from(canonicalJson({ ...legacy, approvalIdentity: identity(legacy) }) + "\n")), /policy/u);
reject(() => readApprovalRecord(Buffer.from(JSON.stringify(record))), /serialization/u);
reject(() => readApprovalRecord(Buffer.from(canonicalJson({ ...record, unknown: true }) + "\n")), /unknown/u);
reject(() => parseStrictJson(Buffer.from('{"approvalIdentity":"a","approvalIdentity":"b"}')), /duplicate/u);
reject(() => assertTrustedAdmission({ approval: record, authority: {} }, {}), /Trusted/u);
const headerBody = { schemaVersion: 1, experimentId: "fixture", labelBudget: 1, experimentPermissionDigest: sha256(Buffer.from("permission")) };
const header = { ...headerBody, identity: identity(headerBody) };
const startedBody = { schemaVersion: 1, sequence: 1, event: "started", executionRunId: "fixture-a", candidateLabel: "A", phase: "fixture", previousSha256: header.identity };
const started = { ...startedBody, entrySha256: identity(startedBody) };
const bytes = (...items) => Buffer.from(items.map(canonicalJson).join("\n") + "\n");
const selection = { experimentId: "fixture", executionRunId: "fixture-a", candidateLabel: "A" };
const before = parseReleasePhaseJournal(bytes(header), selection);
assert.equal(before.journal.usedBudget, 0); checks++;
const claimed = parseReleasePhaseJournal(bytes(header, started), selection);
assert.equal(claimed.journal.usedBudget, 1); checks++; // Failed work has no completion, but its started claim remains consumed.
assert.equal(claimed.journal.completedPhase, null); checks++;
assertReleaseJournalHead(bytes(header), { previousJournalEntrySha256: before.previousSha256, journalEntries: before.journalEntries }); checks++;
reject(() => assertReleaseJournalHead(bytes(header, started), { previousJournalEntrySha256: before.previousSha256, journalEntries: before.journalEntries }), /concurrent/u);
reject(() => parseReleasePhaseJournal(bytes(header, { ...started, previousSha256: sha256(Buffer.from("wrong")) }), selection), /chain/u);
reject(() => parseReleasePhaseJournal(bytes(header, { ...started, sequence: 2 }), selection), /chain/u);
reject(() => parseReleasePhaseJournal(bytes(header), { ...selection, experimentId: "wrong" }), /header/u);
reject(() => parseReleasePhaseJournal(Buffer.from(canonicalJson(header) + '\n{"event":"started","event":"completed"}\n'), selection), /duplicate/u);
const temp = await mkdtemp(path.join(os.tmpdir(), "ued-operator-fixture-"));
try { await assert.rejects(readFile(path.join(temp, "missing-record.json")), { code: "ENOENT" }); checks++; } finally { await rm(temp, { recursive: true, force: true }); }
if (process.platform !== "win32") { await assert.rejects(loadTrustConfiguration(), /requires Windows/u); checks++; }
const store = await readFile(new URL("release-approval-store.mjs", import.meta.url), "utf8");
assert.match(store, /GetTokenInformation/u); assert.match(store, /Read\(\$id.Token,20\)/u); assert.match(store, /Read\(\$id.Token,25\)/u); checks += 3;
const lock = await readFile(new URL("release-journal-lock.mjs", import.meta.url), "utf8");
assert.match(lock, /Global\\\\UED-Release-Journal/u); assert.match(lock, /CreateFile\(\$p,0x100004/u); checks += 2;
process.stdout.write(JSON.stringify({ result: "PASS", checks, scope: "pure Trusted Operator schema/token/ACL/receipt/journal fixtures and static adapters; actual Windows token/ACL/mutex/write-through integration pending" }) + "\n");
