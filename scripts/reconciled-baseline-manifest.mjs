import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { dshPayloadFiles, servicePayloadFiles, assertPayloadPath } from "./windows-release-payload.mjs";
import { deriveHostRuntimeModuleClosure } from "./host-runtime-module-closure.mjs";
import { isReleaseSourceExcluded } from "./create-controlled-source-snapshot.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareUtf8 = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const applicationRequired = ["src/app/haldur-design-skill/page.tsx", "src/app/api/haldur-design-skill/route.ts", "src/app/api/haldur-design-skill/directories/route.ts", "src/app/api/haldur-design-skill/files/route.ts", "src/app/api/haldur-design-skill/files/content/route.ts", "src/app/api/haldur-design-skill/download/route.ts", "src/app/api/haldur-design-skill/admin/audit/route.ts", "src/app/api/haldur-design-skill/admin/recovery/route.ts", "src/app/api/haldur-design-skill/admin/runtime/route.ts", "src/components/haldur/HaldurDesignSkillWorkbench.tsx", "src/components/haldur/HaldurMarkdownDocumentPanel.tsx", "src/config/modules.ts"];
export const sourceRequired = ["package.json", ...dshPayloadFiles, ...servicePayloadFiles].map(assertPayloadPath);

function canonicalPath(value) {
  if (typeof value !== "string") throw new Error("baseline path is invalid.");
  const normalized = value.replaceAll("\\", "/").normalize("NFC");
  if (path.win32.isAbsolute(normalized) || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`unsafe baseline path: ${value}`);
  return normalized;
}

function membershipFor(relativePath, runtimeModules) {
  const values = ["SNAPSHOT_REQUIRED"];
  if (sourceRequired.includes(relativePath) || runtimeModules.has(relativePath)) values.push("SOURCE_REQUIRED");
  if (runtimeModules.has(relativePath)) values.push("HOST_RUNTIME_CLOSURE");
  if (applicationRequired.includes(relativePath)) values.push("APPLICATION_REQUIRED");
  if (relativePath.startsWith("src/")) values.push("APPLICATION_SOURCE");
  if (relativePath.startsWith("agent-integration/dsh/") || relativePath === "agent-integration/scripts/dsh-source-validator.mjs") values.push("DSH_SOURCE");
  if (["scripts/windows-release-constructor.mjs", "scripts/windows-release-payload.mjs", "scripts/windows-deployment-contract.mjs", "scripts/release-artifact-tree.mjs"].includes(relativePath)) values.push("CONSTRUCTOR_STATIC");
  return values.sort(compareUtf8);
}

function list(root, args, collector) {
  return execFileSync("git", ["-C", root, "ls-files", ...args, "-z"]).toString("utf8").split("\0").filter(Boolean).map((relativePath) => ({ relativePath, collector }));
}

export async function collectBaselineRecords(root) {
  const runtimeClosure = await deriveHostRuntimeModuleClosure(root);
  const runtimeModules = new Set(runtimeClosure.modules.map((module) => module.path));
  const requiredSourcePaths = [...new Set([...sourceRequired, ...runtimeModules])];
  const raw = [
    ...list(root, ["--cached"], "git-cached"),
    ...list(root, ["--modified"], "git-modified"),
    ...list(root, ["--others", "--exclude-standard"], "git-untracked"),
  ].filter((occurrence) => !isReleaseSourceExcluded(occurrence.relativePath));
  const groups = new Map();
  for (const occurrence of raw) {
    const relativePath = canonicalPath(occurrence.relativePath);
    const key = relativePath.toLocaleLowerCase("en-US");
    const entries = groups.get(key) ?? [];
    entries.push({ ...occurrence, relativePath }); groups.set(key, entries);
  }
  const records = [];
  const provenance = [];
  for (const entries of groups.values()) {
    const canonical = entries[0].relativePath;
    if (entries.some((entry) => entry.relativePath !== canonical)) throw new Error(`Windows case-insensitive path collision: ${entries.map((entry) => entry.relativePath).join(", ")}`);
    const absolute = path.join(root, ...canonical.split("/")); const stat = await lstat(absolute); const physicalPath = await realpath(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) throw new Error(`baseline member is not a regular single-link file: ${canonical}`);
    const bytes = await readFile(absolute); const identity = { sha256: sha256(bytes), size: bytes.length, physicalPath };
    provenance.push({ relativePath: canonical, occurrenceCount: entries.length, collectors: entries.map((entry) => entry.collector).sort(compareUtf8), ...identity });
    records.push({ relativePath: canonical, sha256: identity.sha256, size: identity.size, lifecycle: sourceRequired.includes(canonical) || runtimeModules.has(canonical) ? (canonical.endsWith("node-22.23.3-x64.artifact.json") ? "SOURCE_IDENTITY_INPUT" : "SOURCE_PAYLOAD") : canonical.startsWith("src/") ? "APPLICATION_SOURCE" : "RELEASE_SOURCE_INPUT", closureMembership: membershipFor(canonical, runtimeModules) });
  }
  records.sort((a, b) => compareUtf8(a.relativePath, b.relativePath));
  const paths = new Set(records.map((record) => record.relativePath));
  for (const required of [...requiredSourcePaths, ...applicationRequired]) if (!paths.has(required)) throw new Error(`required baseline source missing: ${required}`);
  return { records, runtimeClosure, provenance: provenance.filter((item) => item.occurrenceCount > 1).sort((a, b) => compareUtf8(a.relativePath, b.relativePath)) };
}

export function canonicalizeFixtures(entries) {
  const groups = new Map();
  for (const entry of entries) { const relativePath = canonicalPath(entry.relativePath); const key = relativePath.toLocaleLowerCase("en-US"); const values = groups.get(key) ?? []; values.push({ ...entry, relativePath }); groups.set(key, values); }
  return [...groups.values()].map((values) => { const first = values[0]; if (values.some((value) => value.relativePath !== first.relativePath)) throw new Error("Windows case-insensitive path collision."); if (values.some((value) => value.sha256 !== first.sha256 || value.size !== first.size || value.physicalPath !== first.physicalPath)) throw new Error("baseline source identity conflict."); return { relativePath: first.relativePath, sha256: first.sha256, size: first.size, physicalPath: first.physicalPath, closureMembership: [...new Set(values.flatMap((value) => value.closureMembership ?? []))].sort(compareUtf8) }; }).sort((a, b) => compareUtf8(a.relativePath, b.relativePath));
}

export const baselineRequirements = { applicationRequired, sourceRequired };
