import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { parseStrictJson } from "./release-json-contract.mjs";
import { nativeComponentDefinitions, verifyFrozenNativeSet, calculateNativeSourceInputs } from "./native-artifact-contract.mjs";
import { assertNativeBuildReceiptSet, inspectNativeExecutable } from "./native-build-authority.mjs";
export async function createNativeBuildReceiptSet({ nativeRoot, sourceRoot, receiptRoot, outputPath }) {
  for (const root of [nativeRoot, sourceRoot, receiptRoot, outputPath]) if (!path.isAbsolute(root)) throw new Error("Native receipt set requires absolute paths");
  if ([nativeRoot, sourceRoot].some((root) => outputPath === root || outputPath.startsWith(root + path.sep))) throw new Error("Native creation receipts must remain external to immutable outputs/source");
  const native = await verifyFrozenNativeSet(nativeRoot), manifestBytes = await readFile(path.join(nativeRoot, "native-components.manifest.json"));
  const receipts = [], actualMembers = [];
  for (const role of nativeComponentDefinitions) {
    receipts.push(parseStrictJson(await readFile(path.join(receiptRoot, role.componentName + ".receipt.json"))));
    const bytes = await readFile(path.join(nativeRoot, ...role.executableRelativePath.split("/"))); const inspection = inspectNativeExecutable(bytes);
    actualMembers.push({ path: role.executableRelativePath, size: bytes.length, sha256: sha256(bytes), inspection });
  }
  receipts.sort((a, b) => a.build.output.relativePath.localeCompare(b.build.output.relativePath, "en"));
  const set = { schemaVersion: 1, kind: "NativeBuildReceiptSet", nativeManifestSha256: sha256(manifestBytes), receipts };
  const bytes = Buffer.from(canonicalJson(set) + "\n");
  assertNativeBuildReceiptSet(bytes, { approvedSha256: sha256(bytes), nativeManifest: native.manifest, actualMembers, sourceInputs: await calculateNativeSourceInputs(sourceRoot) });
  await writeFile(outputPath, bytes, { flag: "wx" }); return { sha256: sha256(bytes), outputPath };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: node create-native-build-receipt-set.mjs <packet.json>");
  process.stdout.write(canonicalJson(await createNativeBuildReceiptSet(parseStrictJson(await readFile(process.argv[2])))) + "\n");
}
