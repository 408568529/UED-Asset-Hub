import assert from "node:assert/strict";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { nativeComponentDefinitions, calculateNativeSourceInputs, nativeSourceIdentity } from "./native-artifact-contract.mjs";
import { createNativeBuildReceipt, nativeBuildReceiptBytes, assertNativeBuildReceipt, assertNativeBuildReceiptSet, nativeComponentArgv, inspectNativeExecutable } from "./native-build-authority.mjs";
const h = (value) => sha256(Buffer.from(String(value)));
const inputs = await calculateNativeSourceInputs(import.meta.dirname + "/..");
const pe = Buffer.alloc(512); pe.write("MZ"); pe.writeUInt32LE(64,60); pe.writeUInt32LE(0x4550,64); pe.writeUInt16LE(0x8664,68); pe.writeUInt16LE(240,84); pe.writeUInt16LE(0x20b,88);
const toolchain = { compiler: { name: "cl.exe", version: "fixture-compiler", sha256: h("compiler") }, linker: { name: "link.exe", version: "fixture-linker", sha256: h("linker") }, sdk: { name: "WindowsSDK", version: "fixture-sdk", sha256: h("sdk") } };
const source = { sourceCommit: "a".repeat(40), sourceArchiveSha256: h("fixture-archive"), nativeSourceIdentity: nativeSourceIdentity(inputs), inputs };
const receipts = nativeComponentDefinitions.map((role) => createNativeBuildReceipt({ schemaVersion: 1, experimentId: "isolated-native-fixture", executionRunId: "original-native-creator", source, toolchain, build: { configuration: "release-native", normalizedArgv: nativeComponentArgv(role), output: { relativePath: role.executableRelativePath, size: pe.length, sha256: sha256(pe) }, inspection: inspectNativeExecutable(pe) }, artifactCreation: { creatorRunId: "original-native-creator", createdAt: "2026-09-30T00:00:00.000Z" }, observations: { hostname: "fixture", compilerPath: "C:\\fixture\\cl.exe", linkerPath: "C:\\fixture\\link.exe", sdkRoot: "C:\\fixture\\sdk", workingDirectory: "C:\\fixture\\temp" } })).sort((a,b) => a.build.output.relativePath < b.build.output.relativePath ? -1 : 1);
const nativeManifest = { sourceCommit: source.sourceCommit, sourceArchiveSha256: source.sourceArchiveSha256, nativeSourceIdentity: source.nativeSourceIdentity, nativeSourceInputs: inputs, nativeSetDigest: h("fixture-native-set"), toolchain: { compilerVersion: "fixture-compiler", linkerVersion: "fixture-linker", windowsSdkVersion: "fixture-sdk" } };
const actualMembers = receipts.map((receipt) => ({ path: receipt.build.output.relativePath, size: pe.length, sha256: sha256(pe), inspection: inspectNativeExecutable(pe) }));
const set = { schemaVersion: 1, kind: "NativeBuildReceiptSet", nativeManifestSha256: sha256(Buffer.from(canonicalJson(nativeManifest) + "\n")), receipts };
const bytes = Buffer.from(canonicalJson(set) + "\n"), expected = { approvedSha256: sha256(bytes), nativeManifest, actualMembers, sourceInputs: inputs };
assert.equal(assertNativeBuildReceiptSet(bytes, expected).receipts.length, 3);
let checks = 1;
const receipt = receipts[0];
const approved = { sourceCommit: source.sourceCommit, sourceArchiveSha256: source.sourceArchiveSha256, nativeSourceIdentity: source.nativeSourceIdentity, inputs, toolchain, normalizedArgv: receipt.build.normalizedArgv, output: receipt.build.output, creatorRunId: "original-native-creator", experimentId: "isolated-native-fixture" };
for (const change of [{ sourceArchiveSha256: h("other archive") }, { sourceCommit: "b".repeat(40) }, { creatorRunId: "current-constructor-run" }, { toolchain: { ...toolchain, compiler: { ...toolchain.compiler, sha256: h("another compiler") } } }, { normalizedArgv: ["compiler:/invented"] }, { output: { ...approved.output, sha256: h("wrong binary") } }]) {
  assert.throws(() => assertNativeBuildReceipt(receipt, { expectedSha256: sha256(nativeBuildReceiptBytes(receipt)), expected: { ...approved, ...change } })); checks++;
}
for (const change of [{ experimentId: {} }, { executionRunId: [] }, { artifactCreation: { ...receipt.artifactCreation, createdAt: "2026-09-30" } }, { artifactCreation: { ...receipt.artifactCreation, createdAt: "invalid" } }]) {
  const { receiptIdentity: _old, ...body } = receipt;
  const changed = createNativeBuildReceipt({ ...body, ...change });
  assert.throws(() => assertNativeBuildReceipt(changed, { expectedSha256: sha256(nativeBuildReceiptBytes(changed)), expected: approved })); checks++;
}
assert.throws(() => assertNativeBuildReceiptSet(bytes, { ...expected, actualMembers: actualMembers.slice(1) }), /missing/u); checks++;
assert.throws(() => assertNativeBuildReceiptSet(Buffer.from(canonicalJson(set)), expected), /SHA/u); checks++;
assert.throws(() => assertNativeBuildReceiptSet(bytes, { ...expected, nativeManifest: { ...nativeManifest, toolchain: { ...nativeManifest.toolchain, compilerVersion: "wrong" } } }), /manifest/u); checks++;
process.stdout.write(JSON.stringify({ result: "PASS", checks, scope: "synthetic PE and receipt fixtures; no MSVC execution" }) + "\n");
