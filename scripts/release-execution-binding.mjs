import path from "node:path";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";

const fail = (message) => { throw new Error("EXECUTION_BINDING_INVALID:" + message); };
const hashPattern = /^[a-f0-9]{64}$/u;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const receiptKeys = ["sourceManifestSha256", "sourceCreationReceiptSha256", "toolchainReceiptSha256", "environmentReceiptSha256", "dependencyReceiptSha256", "nativeManifestSha256", "nativeCreationReceiptSha256", "dshBundleAuthoritySha256", "dshProvenanceSha256", "securityProtectedArtifactSha256"];
const locatorKeys = ["stagingRoot", "canonicalWorkspace", "tempRoot", "outputRoot", "evidenceRoot", "sourceArtifact", "nativeRoot", "dshMaterializationRoot", "toolchainRoot", "securityArtifact"];
const permissionKeys = ["experimentPermissionDigest", "labelBudget", "resumePolicy", "expectedPhase", "journalIdentity"];

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(label + " must be an object");
  const actual = Object.keys(value).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) fail(label + " has unknown or missing fields");
}
function isAbsolute(value) { return path.isAbsolute(value) || path.win32.isAbsolute(value); }
function resolveFor(value, windows) { return windows ? path.win32.resolve(value) : path.resolve(value); }
function contains(root, candidate) {
  const windows = path.win32.isAbsolute(root) || path.win32.isAbsolute(candidate);
  const base = resolveFor(root, windows);
  const target = resolveFor(candidate, windows);
  const rel = (windows ? path.win32 : path).relative(base, target);
  return rel !== "" && rel !== "." && rel !== ".." && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export function createExecutionBinding(input, expected) {
  const value = { ...input };
  value.bindingId = sha256(Buffer.from(canonicalJson(value), "utf8"));
  return assertExecutionBinding(value, expected);
}

export function assertExecutionBinding(binding, expected) {
  exactKeys(binding, ["schemaVersion", "experimentId", "executionRunId", "candidateLabel", "inputAuthorityIdentity", "receipts", "bindings", "locators", "permission", "bindingId"], "binding");
  if (binding.schemaVersion !== 1 || !idPattern.test(binding.experimentId || "") || !idPattern.test(binding.executionRunId || "") || !["A", "B", "single", "pre-r3"].includes(binding.candidateLabel) || !hashPattern.test(binding.inputAuthorityIdentity || "")) fail("identity");
  exactKeys(binding.receipts, receiptKeys, "receipts");
  for (const key of receiptKeys) if (!hashPattern.test(binding.receipts[key] || "")) fail("receipt " + key);
  exactKeys(binding.bindings, ["nativeRunBindingSha256", "dshMode", "dshRunBindingSha256"], "bindings");
  if (!hashPattern.test(binding.bindings.nativeRunBindingSha256 || "") || !["bundle", "offline"].includes(binding.bindings.dshMode)) fail("binding hashes");
  if (binding.bindings.dshMode === "offline") {
    if (!hashPattern.test(binding.bindings.dshRunBindingSha256 || "")) fail("offline DSH run binding");
  } else if (binding.bindings.dshRunBindingSha256 !== null) fail("bundle DSH binding must use null");
  exactKeys(binding.locators, locatorKeys, "locators");
  for (const key of locatorKeys) if (typeof binding.locators[key] !== "string" || !isAbsolute(binding.locators[key])) fail("locator " + key);
  const root = binding.locators.stagingRoot;
  for (const key of locatorKeys.slice(1)) if (!contains(root, binding.locators[key])) fail("locator escapes staging root: " + key);
  for (const key of ["canonicalWorkspace", "tempRoot", "outputRoot", "evidenceRoot"]) {
    for (const other of ["canonicalWorkspace", "tempRoot", "outputRoot", "evidenceRoot"]) {
      if (key !== other && (resolveFor(binding.locators[key], path.win32.isAbsolute(root)).toLowerCase() === resolveFor(binding.locators[other], path.win32.isAbsolute(root)).toLowerCase() || (!(key === "tempRoot" && other === "canonicalWorkspace") && contains(binding.locators[key], binding.locators[other])))) fail("execution roots overlap");
    }
  }
  for (const mutable of ["canonicalWorkspace", "tempRoot", "outputRoot", "evidenceRoot"]) {
    for (const immutable of ["sourceArtifact", "nativeRoot", "toolchainRoot", "securityArtifact", "dshMaterializationRoot"]) {
      const a = resolveFor(binding.locators[mutable], path.win32.isAbsolute(root)).toLowerCase();
      const b = resolveFor(binding.locators[immutable], path.win32.isAbsolute(root)).toLowerCase();
      if (a === b || contains(a, b) || contains(b, a)) fail("execution root overlaps selected input: " + mutable + "/" + immutable);
    }
  }
  exactKeys(binding.permission, permissionKeys, "permission");
  if (!hashPattern.test(binding.permission.experimentPermissionDigest || "") || !Number.isSafeInteger(binding.permission.labelBudget) || binding.permission.labelBudget < 1 || !["never", "same-run-incomplete-phase"].includes(binding.permission.resumePolicy) || !idPattern.test(binding.permission.expectedPhase || "") || !hashPattern.test(binding.permission.journalIdentity || "")) fail("phase/budget permission");
  const { bindingId, ...body } = binding;
  if (!hashPattern.test(bindingId || "") || sha256(Buffer.from(canonicalJson(body), "utf8")) !== bindingId) fail("binding identity");
  if (!expected || typeof expected !== "object") fail("mandatory expected identity missing");
  for (const key of ["experimentId", "executionRunId", "candidateLabel", "inputAuthorityIdentity", "phase"]) {
    const actual = key === "phase" ? binding.permission.expectedPhase : binding[key];
    if (expected[key] !== actual) fail("expected " + key + " mismatch");
  }
  if (expected.receipts === undefined || expected.bindings === undefined) fail("expected receipt/binding hashes missing");
  exactKeys(expected.receipts, receiptKeys, "expected receipts");
  for (const key of receiptKeys) if (expected.receipts[key] !== binding.receipts[key]) fail("expected receipt mismatch: " + key);
  exactKeys(expected.bindings, ["nativeRunBindingSha256", "dshMode", "dshRunBindingSha256"], "expected bindings");
  if (canonicalJson(expected.bindings) !== canonicalJson(binding.bindings)) fail("expected run bindings mismatch");
  if (expected.journal === undefined || expected.journal.completedPhase === undefined) fail("phase journal state missing");
  if (expected.journal.completedPhase === binding.permission.expectedPhase) fail("completed phase replay");
  if (expected.journal.identity !== binding.permission.journalIdentity || expected.journal.executionRunId !== binding.executionRunId) fail("phase journal ownership");
  if (!Number.isSafeInteger(expected.journal.usedBudget) || expected.journal.usedBudget >= binding.permission.labelBudget) fail("execution budget exhausted");
  return binding;
}
