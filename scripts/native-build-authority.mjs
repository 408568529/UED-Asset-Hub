import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { exact, hash, identity, parseStrictJson } from "./release-json-contract.mjs";
import { nativeComponentDefinitions, nativeSourceIdentity } from "./native-artifact-contract.mjs";
export function inspectNativeExecutable(bytes) {
  const need = (offset, size) => { if (!Number.isSafeInteger(offset) || offset < 0 || offset + size > bytes.length) throw new Error("Native PE truncated"); };
  need(0, 64); if (bytes.toString("ascii", 0, 2) !== "MZ") throw new Error("Native DOS signature");
  const pe = bytes.readUInt32LE(60); need(pe, 24);
  if (bytes.readUInt32LE(pe) !== 0x4550 || bytes.readUInt16LE(pe + 4) !== 0x8664) throw new Error("Native PE must be AMD64");
  const sections = bytes.readUInt16LE(pe + 6), optionalSize = bytes.readUInt16LE(pe + 20), optional = pe + 24;
  need(optional, optionalSize); if (optionalSize < 128 || bytes.readUInt16LE(optional) !== 0x20b) throw new Error("Native PE32+ optional header");
  if (optionalSize >= 224 && (bytes.readUInt32LE(optional + 216) || bytes.readUInt32LE(optional + 220))) throw new Error("Native delay imports require explicit inspection support");
  const sectionStart = optional + optionalSize; need(sectionStart, sections * 40);
  const rvaOffset = (rva, size = 1) => {
    for (let i = 0; i < sections; i++) { const base = sectionStart + i * 40, va = bytes.readUInt32LE(base + 12), rawSize = bytes.readUInt32LE(base + 16), raw = bytes.readUInt32LE(base + 20); if (rva >= va && rva + size <= va + rawSize) { const offset = raw + rva - va; need(offset, size); return offset; } }
    throw new Error("Native PE import RVA");
  };
  const imports = [], importRva = bytes.readUInt32LE(optional + 120), importSize = bytes.readUInt32LE(optional + 124);
  if (importRva) {
    let terminated = false;
    for (let i = 0; (i + 1) * 20 <= importSize; i++) {
      const entry = rvaOffset(importRva + i * 20, 20);
      if (bytes.subarray(entry, entry + 20).every((value) => value === 0)) { terminated = true; break; }
      const name = rvaOffset(bytes.readUInt32LE(entry + 12)); let end = name;
      while (end < bytes.length && end - name < 256 && bytes[end]) end++;
      if (end === bytes.length || end - name >= 256) throw new Error("Native PE import name");
      const library = bytes.toString("ascii", name, end).toUpperCase(); if (!/^[A-Z0-9._-]+\.DLL$/u.test(library)) throw new Error("Native PE import library"); imports.push(library);
    }
    if (!terminated) throw new Error("Native PE import descriptors not terminated");
  }
  return { machine: "AMD64", imports: [...new Set(imports)].sort(), observedSha256: sha256(bytes), observedSize: bytes.length };
}
export function createNativeBuildReceipt(body) { return { ...body, receiptIdentity: identity(body) }; }
export function nativeBuildReceiptBytes(receipt) { return Buffer.from(canonicalJson(receipt) + "\n"); }
export function assertNativeBuildReceipt(receipt, { expectedSha256, receiptBytes = nativeBuildReceiptBytes(receipt), expected } = {}) {
  exact(receipt, ["schemaVersion", "experimentId", "executionRunId", "source", "toolchain", "build", "artifactCreation", "observations", "receiptIdentity"], "NativeBuildReceipt");
  if (receipt.schemaVersion !== 1 || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(receipt.experimentId || "") || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(receipt.executionRunId || "")) throw new Error("Native creation identity");
  exact(receipt.source, ["sourceCommit", "sourceArchiveSha256", "nativeSourceIdentity", "inputs"], "Native source");
  if (!/^[a-f0-9]{40}$/u.test(receipt.source.sourceCommit || "")) throw new Error("Native source commit");
  hash(receipt.source.sourceArchiveSha256, "Native archive"); hash(receipt.source.nativeSourceIdentity, "Native source identity");
  if (nativeSourceIdentity(receipt.source.inputs) !== receipt.source.nativeSourceIdentity) throw new Error("Native input identity derivation");
  exact(receipt.toolchain, ["compiler", "linker", "sdk"], "Native tools");
  for (const name of ["compiler", "linker", "sdk"]) { const tool = receipt.toolchain[name]; exact(tool, ["name", "version", "sha256"], name); hash(tool.sha256, name); if (typeof tool.version !== "string" || !tool.version || tool.name !== ({ compiler: "cl.exe", linker: "link.exe", sdk: "WindowsSDK" })[name]) throw new Error("Native tool name/version"); }
  exact(receipt.build, ["configuration", "normalizedArgv", "output", "inspection"], "Native build");
  if (receipt.build.configuration !== "release-native" || !Array.isArray(receipt.build.normalizedArgv) || !receipt.build.normalizedArgv.length || receipt.build.normalizedArgv.some((arg) => typeof arg !== "string" || !arg || /[A-Za-z]:[\\/]|\/Users\//u.test(arg.replace(/^(?:compiler|linker):/u, "")))) throw new Error("Native normalized argv");
  exact(receipt.build.output, ["relativePath", "size", "sha256"], "Native output");
  const role = nativeComponentDefinitions.find((definition) => definition.executableRelativePath === receipt.build.output.relativePath);
  if (!role || !Number.isSafeInteger(receipt.build.output.size) || receipt.build.output.size < 1) throw new Error("Native output role/size"); hash(receipt.build.output.sha256, "Native output SHA");
  exact(receipt.build.inspection, ["machine", "imports", "observedSha256", "observedSize"], "Native inspection");
  const inspection = receipt.build.inspection;
  if (inspection.machine !== "AMD64" || inspection.observedSize !== receipt.build.output.size || inspection.observedSha256 !== receipt.build.output.sha256 || !Array.isArray(inspection.imports) || inspection.imports.some((name, i) => !/^[A-Z0-9._-]+\.DLL$/u.test(name) || (i && name <= inspection.imports[i - 1]))) throw new Error("Native inspection binding");
  exact(receipt.artifactCreation, ["creatorRunId", "createdAt"], "Native artifactCreation");
  if (receipt.artifactCreation.creatorRunId !== receipt.executionRunId || !Number.isFinite(Date.parse(receipt.artifactCreation.createdAt)) || new Date(receipt.artifactCreation.createdAt).toISOString() !== receipt.artifactCreation.createdAt) throw new Error("Native original creator");
  exact(receipt.observations, ["hostname", "compilerPath", "linkerPath", "sdkRoot", "workingDirectory"], "Native observations");
  if (Object.values(receipt.observations).some((value) => typeof value !== "string" || !value)) throw new Error("Native observation values");
  const { receiptIdentity, ...body } = receipt; if (receiptIdentity !== identity(body)) throw new Error("Native receipt identity");
  hash(expectedSha256, "independently approved Native receipt");
  if (!Buffer.from(receiptBytes).equals(nativeBuildReceiptBytes(receipt)) || sha256(receiptBytes) !== expectedSha256 || !expected) throw new Error("Native approved raw receipt");
  for (const key of ["sourceCommit", "sourceArchiveSha256", "nativeSourceIdentity"]) if (expected[key] !== receipt.source[key]) throw new Error("Native approved source " + key);
  for (const [key, actual] of [["inputs", receipt.source.inputs], ["toolchain", receipt.toolchain], ["normalizedArgv", receipt.build.normalizedArgv], ["output", receipt.build.output]]) if (canonicalJson(expected[key]) !== canonicalJson(actual)) throw new Error("Native expected " + key);
  if (expected.creatorRunId !== receipt.artifactCreation.creatorRunId || expected.experimentId !== receipt.experimentId) throw new Error("Native approved creator/experiment");
  return receipt;
}
export function assertNativeBuildReceiptSet(bytes, { approvedSha256, nativeManifest, actualMembers, sourceInputs }) {
  hash(approvedSha256, "approved native receipt set"); if (sha256(bytes) !== approvedSha256) throw new Error("Native receipt set approved SHA");
  const set = parseStrictJson(bytes);
  exact(set, ["schemaVersion", "kind", "nativeManifestSha256", "receipts"], "Native receipt set");
  if (set.schemaVersion !== 1 || set.kind !== "NativeBuildReceiptSet" || !Array.isArray(set.receipts) || set.receipts.length !== 3 || !Buffer.from(bytes).equals(Buffer.from(canonicalJson(set) + "\n"))) throw new Error("Native receipt set schema/raw bytes");
  const manifestSha = sha256(Buffer.from(canonicalJson(nativeManifest) + "\n"));
  if (set.nativeManifestSha256 !== manifestSha) throw new Error("Native receipt aggregate manifest");
  const roles = nativeComponentDefinitions.map((definition) => definition.executableRelativePath).sort();
  if (canonicalJson(set.receipts.map((receipt) => receipt.build.output.relativePath)) !== canonicalJson(roles)) throw new Error("Native receipt set exact roles");
  const creator = set.receipts[0].artifactCreation.creatorRunId;
  if (nativeManifest.nativeSetDigest === undefined || canonicalJson(sourceInputs) !== canonicalJson(nativeManifest.nativeSourceInputs)) throw new Error("Native aggregate source inputs");
  for (const receipt of set.receipts) {
    nativeRuntimeDependencyClassification(receipt.build.inspection);
    const member = actualMembers.find((entry) => entry.path === receipt.build.output.relativePath);
    if (!member) throw new Error("Native receipt output member missing");
    if (canonicalJson(member.inspection) !== canonicalJson(receipt.build.inspection)) throw new Error("Native actual inspection differs from original receipt");
    assertNativeBuildReceipt(receipt, { expectedSha256: sha256(nativeBuildReceiptBytes(receipt)), expected: { sourceCommit: nativeManifest.sourceCommit, sourceArchiveSha256: nativeManifest.sourceArchiveSha256, nativeSourceIdentity: nativeManifest.nativeSourceIdentity, inputs: sourceInputs, toolchain: receipt.toolchain, normalizedArgv: nativeComponentArgv(nativeComponentDefinitions.find((role) => role.executableRelativePath === member.path)), output: { relativePath: member.path, sha256: member.sha256, size: member.size }, creatorRunId: creator, experimentId: set.receipts[0].experimentId } });
    if (receipt.toolchain.compiler.version !== nativeManifest.toolchain.compilerVersion || receipt.toolchain.linker.version !== nativeManifest.toolchain.linkerVersion || receipt.toolchain.sdk.version !== nativeManifest.toolchain.windowsSdkVersion || canonicalJson(receipt.toolchain) !== canonicalJson(set.receipts[0].toolchain)) throw new Error("Native actual tools/aggregate declarations");
  }
  return set;
}
export function nativeComponentArgv(role) {
  const flags = ["compiler:/nologo", "compiler:/std:c++17", "compiler:/EHsc", "compiler:/O2", ...(role.componentName === "pipe-security-adapter" ? ["compiler:/W4"] : []), "compiler:/c", "compiler:/Fo<TEMP>/component.obj", "compiler:/Fd<TEMP>/component.pdb", "compiler:<SOURCE>/" + role.sourceRelativePath];
  return [...flags, "linker:/NOLOGO", "linker:/MACHINE:X64", "linker:/OUT:<OUTPUT>/" + role.executableRelativePath, "linker:/PDB:<TEMP>/component-link.pdb", "linker:<TEMP>/component.obj", ...(role.componentName === "pipe-security-adapter" ? ["linker:Advapi32.lib"] : role.componentName === "dpapi-helper" ? ["linker:Crypt32.lib"] : [])];
}

export function nativeRuntimeDependencyClassification(inspection) {
  const system = new Set(["KERNEL32.DLL", "ADVAPI32.DLL", "CRYPT32.DLL", "USER32.DLL", "SHELL32.DLL", "OLE32.DLL", "OLEAUT32.DLL", "BCRYPT.DLL", "NTDLL.DLL", "WS2_32.DLL", "SECHOST.DLL", "RPCRT4.DLL", "VERSION.DLL", "UCRTBASE.DLL"]);
  if (inspection.imports.some((name) => !system.has(name) && !/^API-MS-WIN-[A-Z0-9-]+\.DLL$/u.test(name))) throw new Error("Native non-system runtime dependency requires an approved package/classification");
  return "A";
}
