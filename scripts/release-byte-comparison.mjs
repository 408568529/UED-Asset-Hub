import { createHash } from "node:crypto";
import { lstat, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "./release-artifact-tree.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const compare = (a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
async function inventory(root) {
  const base = path.resolve(root), files = [];
  async function visit(directory, relative = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
      const child = relative ? relative + "/" + entry.name : entry.name;
      const absolute = path.join(base, ...child.split("/"));
      const details = await lstat(absolute);
      if (details.isSymbolicLink() || (!details.isDirectory() && details.nlink > 1)) throw new Error("BYTE_TREE_UNSAFE_ENTRY:" + child);
      if (details.isDirectory()) await visit(absolute, child);
      else if (details.isFile()) {
        const bytes = await readFile(absolute);
        files.push({ path: child, size: bytes.length, sha256: hash(bytes), bytes });
      } else throw new Error("BYTE_TREE_UNSUPPORTED_ENTRY:" + child);
    }
  }
  await visit(base);
  files.sort((a, b) => compare(a.path, b.path));
  return files;
}
export async function calculateCompleteByteTreeInventory(root) {
  const files = await inventory(root);
  const members = files.map(({ path: filePath, size, sha256 }) => ({ path: filePath, size, sha256 }));
  return { schemaVersion: 1, fileCount: members.length, totalBytes: members.reduce((total, file) => total + file.size, 0), files: members, sha256: hash(Buffer.from(canonicalJson(members), "utf8")) };
}
function compareInventories(left, right) {
  const a = new Map(left.map((file) => [file.path, file]));
  const b = new Map(right.map((file) => [file.path, file]));
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort(compare);
  for (const filePath of paths) {
    const first = a.get(filePath), second = b.get(filePath);
    if (!first || !second) return { path: filePath, kind: first ? "MISSING_RIGHT" : "MISSING_LEFT", left: first ? { size: first.size, sha256: first.sha256 } : null, right: second ? { size: second.size, sha256: second.sha256 } : null };
    if (first.size !== second.size || first.sha256 !== second.sha256 || !first.bytes.equals(second.bytes)) {
      let offset = 0;
      while (offset < Math.min(first.bytes.length, second.bytes.length) && first.bytes[offset] === second.bytes[offset]) offset++;
      return { path: filePath, kind: first.size !== second.size ? "SIZE" : "RAW_BYTES", firstDifferentByteOffset: offset, left: { size: first.size, sha256: first.sha256 }, right: { size: second.size, sha256: second.sha256 } };
    }
  }
  return null;
}
export async function compareReleaseByteTrees(leftRoot, rightRoot, { label = "release", evidencePath = null } = {}) {
  const [left, right] = await Promise.all([inventory(leftRoot), inventory(rightRoot)]);
  const divergence = compareInventories(left, right);
  const result = { schemaVersion: 1, label, leftRoot: path.resolve(leftRoot), rightRoot: path.resolve(rightRoot), leftCount: left.length, rightCount: right.length, equal: divergence === null, divergence };
  if (divergence && evidencePath) {
    const evidence = { schemaVersion: 1, label, divergence, leftInventory: left.map(({ path: filePath, size, sha256 }) => ({ path: filePath, size, sha256 })), rightInventory: right.map(({ path: filePath, size, sha256 }) => ({ path: filePath, size, sha256 })) };
    await mkdir(path.dirname(path.resolve(evidencePath)), { recursive: true });
    await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
  }
  if (divergence) throw new Error("BYTE_TREE_MISMATCH:" + JSON.stringify(divergence));
  return result;
}
export async function compareCandidateAndRuntimeTrees({ candidateA, candidateB, runtimeA, runtimeB, evidenceRoot }) {
  const candidate = await compareReleaseByteTrees(candidateA, candidateB, { label: "candidate", evidencePath: evidenceRoot ? path.join(evidenceRoot, "candidate-first-divergence.json") : null });
  const runtime = await compareReleaseByteTrees(runtimeA, runtimeB, { label: "runtime", evidencePath: evidenceRoot ? path.join(evidenceRoot, "runtime-first-divergence.json") : null });
  return { schemaVersion: 1, candidate, runtime };
}
