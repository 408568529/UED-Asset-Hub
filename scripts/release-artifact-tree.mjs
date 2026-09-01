import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const artifactDigestAlgorithm = "ued-asset-hub-release-tree-v1";

const identityMetadata = new Set(["deployment.manifest.json", "deployment.manifest.sha256"]);
const reservedNames = new Set(["CON", "PRN", "AUX", "NUL", ...Array.from({ length: 9 }, (_, index) => `COM${index + 1}`), ...Array.from({ length: 9 }, (_, index) => `LPT${index + 1}`)]);
const forbiddenSegments = new Set([".git", ".env", ".env.local", ".npm-cache", ".pnpm-store", "runtime-data", "training-media", "agent-runtime", "dsh-home"]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compareUtf8(left, right) {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function normalizeArtifactPath(value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || value.includes("\\")) {
    throw new Error(`unsafe artifact path: ${String(value)}`);
  }
  const normalized = value.normalize("NFC").replaceAll(path.sep, "/");
  const segments = normalized.split("/");
  for (const segment of segments) {
    const stem = segment.split(".")[0].toUpperCase();
    if (!segment || segment === "." || segment === ".." || /[\u0000-\u001f:]/u.test(segment) || /[.\s]$/u.test(segment) || reservedNames.has(stem) || forbiddenSegments.has(segment.toLowerCase())) {
      throw new Error(`unsafe artifact path segment: ${segment}`);
    }
  }
  return normalized;
}

function assertNoCollisions(files) {
  const seen = new Set();
  for (const file of files) {
    const key = file.path.normalize("NFC").toLocaleUpperCase("en-US");
    if (seen.has(key)) throw new Error(`case or Unicode artifact path collision: ${file.path}`);
    seen.add(key);
  }
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("canonical JSON supports only safe integer numbers");
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.keys(value).sort(compareUtf8).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error(`unsupported canonical JSON value: ${typeof value}`);
}

export async function calculateReleaseArtifactSet(releaseRoot) {
  const root = path.resolve(releaseRoot);
  const files = [];

  async function collect(directory, relative = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!relative && identityMetadata.has(entry.name)) continue;
      const filePath = path.join(directory, entry.name);
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const normalizedPath = normalizeArtifactPath(childRelative);
      const details = await lstat(filePath);
      if (details.isSymbolicLink()) throw new Error(`links/reparse points are not permitted: ${normalizedPath}`);
      if (details.isDirectory()) {
        await collect(filePath, normalizedPath);
      } else if (details.isFile()) {
        if (details.nlink > 1) throw new Error(`hard linked artifact is not permitted: ${normalizedPath}`);
        files.push({ path: normalizedPath, size: details.size, sha256: sha256(await readFile(filePath)) });
      } else {
        throw new Error(`unsupported artifact entry: ${normalizedPath}`);
      }
    }
  }

  await collect(root);
  files.sort((left, right) => compareUtf8(left.path, right.path));
  assertNoCollisions(files);
  const aggregate = Buffer.concat([
    Buffer.from("UED-ASSET-HUB-RELEASE-TREE-V1\n", "utf8"),
    ...files.map((file) => Buffer.from(`${Buffer.byteLength(file.path, "utf8")}\t${file.size}\t${file.sha256}\t${file.path}\n`, "utf8")),
  ]);
  return {
    algorithm: artifactDigestAlgorithm,
    digest: sha256(aggregate),
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.size, 0),
    files,
  };
}

export function artifactFilesMatch(actual, expected) {
  const project = (files) => files.map(({ path: filePath, size, sha256: digest }) => ({ path: filePath, size, sha256: digest }));
  return canonicalJson(project(actual)) === canonicalJson(project(expected));
}

export function assertArtifactPathSet(files) {
  for (const file of files) normalizeArtifactPath(file.path);
  assertNoCollisions(files);
}

export function windowsFilesystemEvidenceStatus() {
  return {
    reparsePoints: "DEFERRED_TO_WINDOWS_NATIVE_VALIDATION",
    alternateDataStreams: "DEFERRED_TO_WINDOWS_NATIVE_VALIDATION",
  };
}
