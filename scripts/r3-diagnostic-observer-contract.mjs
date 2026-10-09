import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

export const r3DiagnosticObserverPath = "scripts/r3b2b-webpack-observer.cjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function assertR3DiagnosticObserverClosure({ sourceRoot, sourceManifest, snapshot, sourceCommit, sourceArchiveSha256, observerPath }) {
  if (!sourceRoot || !sourceManifest || !snapshot || !/^[a-f0-9]{40}$/.test(sourceCommit || "") || !/^[a-f0-9]{64}$/.test(sourceArchiveSha256 || "")) throw new Error("R3 diagnostic observer source authority is incomplete.");
  if (snapshot.sourceCommit !== sourceCommit || snapshot.sourceArchiveSha256 !== sourceArchiveSha256) throw new Error("R3 diagnostic observer snapshot identity mismatch.");
  const root = await realpath(sourceRoot);
  const expected = path.resolve(root, ...r3DiagnosticObserverPath.split("/"));
  const candidate = path.resolve(observerPath || expected);
  if (candidate !== expected) throw new Error("R3 diagnostic observer source-tree fallback or wrong relative path denied.");
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("R3 diagnostic observer must be inside the isolated source snapshot.");
  const details = await lstat(candidate);
  if (!details.isFile() || details.isSymbolicLink() || details.nlink !== 1) throw new Error("R3 diagnostic observer must be a regular single-link file.");
  const [archiveMember] = sourceManifest.files.filter((file) => file.path === r3DiagnosticObserverPath);
  const [snapshotMember] = snapshot.files.filter((file) => file.relativePath === r3DiagnosticObserverPath && file.fileType === "file");
  if (!archiveMember || !snapshotMember || sourceManifest.files.filter((file) => file.path === r3DiagnosticObserverPath).length !== 1 || snapshot.files.filter((file) => file.relativePath === r3DiagnosticObserverPath).length !== 1) throw new Error("R3 diagnostic observer is not uniquely bound by the source archive and snapshot manifest.");
  const bytes = await readFile(candidate);
  const actualSha256 = sha256(bytes);
  if (bytes.length !== archiveMember.size || actualSha256 !== archiveMember.sha256 || bytes.length !== snapshotMember.size || actualSha256 !== snapshotMember.sha256) throw new Error("R3 diagnostic observer bytes do not match the source archive and snapshot manifest.");
  return { relativePath: r3DiagnosticObserverPath, size: bytes.length, sha256: actualSha256, sourceCommit, sourceArchiveSha256 };
}
