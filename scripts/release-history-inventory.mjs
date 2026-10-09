import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, sha256 } from "./release-artifact-tree.mjs";
import { exact, hash, identity } from "./release-json-contract.mjs";
export const requiredHistoricalRoots = Object.freeze(["sourceV3", "sourceV4", "nativeNb1", "nativeNb2", "nativeNb3", "dshRetry003", "preR3V4Candidate", "failedFormalAV4", "historicalSecuritySet"]);
export async function inventoryHistoricalRoots(approvedRoots) {
  exact(approvedRoots, requiredHistoricalRoots, "approved historical root inventory");
  const roots = [];
  for (const name of requiredHistoricalRoots) {
    const spec = approvedRoots[name]; exact(spec, ["path", "expectedInventoryIdentity"], "approved historical root"); hash(spec.expectedInventoryIdentity, "expected historical inventory");
    if (!path.isAbsolute(spec.path)) throw new Error("Historical root absolute path required");
    const files = [];
    async function visit(file, relative) {
      const details = await lstat(file);
      if (details.isSymbolicLink() || (!details.isDirectory() && (!details.isFile() || details.nlink !== 1))) throw new Error("Historical link/nonregular path: " + file);
      if (details.isDirectory()) for (const entry of (await readdir(file)).sort()) await visit(path.join(file, entry), relative ? relative + "/" + entry : entry);
      else {
        const bytes = await readFile(file); const after = await lstat(file);
        if (details.size !== bytes.length || after.ino !== details.ino || after.size !== details.size || after.mtimeMs !== details.mtimeMs) throw new Error("Historical file changed during inventory");
        files.push({ path: relative || path.basename(file), size: bytes.length, sha256: sha256(bytes) });
      }
    }
    const canonical = await realpath(spec.path); if (canonical !== path.resolve(spec.path)) throw new Error("Historical root realpath mismatch");
    await visit(canonical, ""); if (!files.length) throw new Error("Historical root empty inventory: " + name);
    const inventoryIdentity = identity(files);
    if (inventoryIdentity !== spec.expectedInventoryIdentity) throw new Error("HISTORICAL_BASELINE_MISMATCH: " + name);
    roots.push({ name, path: canonical, files, fileCount: files.length, inventoryIdentity });
  }
  return { schemaVersion: 1, roots, fileCount: roots.reduce((n, root) => n + root.fileCount, 0), inventoryIdentity: identity(roots) };
}
export function assertHistoricalPreservation(before, after) {
  for (const inventory of [before, after]) {
    exact(inventory, ["schemaVersion", "roots", "fileCount", "inventoryIdentity"], "historical inventory");
    if (inventory.schemaVersion !== 1 || !Array.isArray(inventory.roots) || canonicalJson(inventory.roots.map((root) => root.name)) !== canonicalJson(requiredHistoricalRoots) || inventory.fileCount < requiredHistoricalRoots.length || inventory.inventoryIdentity !== identity(inventory.roots)) throw new Error("Historical inventory invalid/empty");
    for (const root of inventory.roots) {
      exact(root, ["name", "path", "files", "fileCount", "inventoryIdentity"], "historical root");
      if (!path.isAbsolute(root.path) || !root.files?.length || root.fileCount !== root.files.length || root.inventoryIdentity !== identity(root.files)) throw new Error("Historical root invalid/empty");
      for (const file of root.files) { exact(file, ["path", "size", "sha256"], "historical file"); hash(file.sha256, "historical byte SHA"); if (!file.path || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error("Historical file invalid"); }
    }
    if (inventory.fileCount !== inventory.roots.reduce((n, root) => n + root.fileCount, 0)) throw new Error("Historical inventory count mismatch");
  }
  if (canonicalJson(before) !== canonicalJson(after)) throw new Error("HISTORICAL_PRESERVATION_FAIL");
  return true;
}
export function assertExecutionRootsPreserveHistory(binding, approvedRoots) {
  exact(approvedRoots, requiredHistoricalRoots, "approved history root selection");
  for (const key of ["tempRoot", "canonicalWorkspace", "outputRoot", "evidenceRoot"]) for (const name of requiredHistoricalRoots) {
    const left = binding.locators[key], right = approvedRoots[name].path;
    const api = path.win32.isAbsolute(left) || path.win32.isAbsolute(right) ? path.win32 : path;
    const a = api.resolve(left).toLowerCase(), b = api.resolve(right).toLowerCase();
    if (a === b || a.startsWith(b + api.sep) || b.startsWith(a + api.sep)) throw new Error("Execution mutable root overlaps immutable history: " + key + "/" + name);
  }
}
