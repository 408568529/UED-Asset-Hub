import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const AUDIT_FILE = "meta/logs.json";

function usage() {
  console.error("Usage: node scripts/verify-e2e-fixture.mjs <snapshot|verify> --fixture <DATA_DIR> [--baseline <file>] [--output <file>] [--allow-audit-type <type>] [--allow-audit-target-type <type>] [--allow-audit-operator <operator>] [--allow-audit-max-added <count>]");
  process.exit(1);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function listFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) files.push(path.relative(root, absolutePath).split(path.sep).join("/"));
      else throw new Error(`Fixture contains unsupported entry: ${path.relative(root, absolutePath)}`);
    }
  }
  await visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

async function readAudit(root) {
  const auditPath = path.join(root, AUDIT_FILE);
  if (!existsSync(auditPath)) return [];
  const value = JSON.parse(await readFile(auditPath, "utf8"));
  assert.ok(Array.isArray(value), "meta/logs.json must be an array");
  return value.map(({ id, createdAt, type, targetType, targetId, operator }) => ({ id, createdAt, type, targetType, targetId, operator }));
}

async function snapshot(root) {
  const files = await listFiles(root);
  const protectedFiles = [];
  for (const relativePath of files) {
    if (relativePath === AUDIT_FILE) continue;
    protectedFiles.push({
      path: relativePath,
      checksum: sha256(await readFile(path.join(root, relativePath)))
    });
  }
  return {
    schemaVersion: 1,
    protectedFileCount: protectedFiles.length,
    protectedFiles,
    protectedHash: sha256(protectedFiles.map((file) => `${file.path}\0${file.checksum}\n`).join("")),
    auditEntries: await readAudit(root)
  };
}

function allowedAudit(entry, options) {
  return (!options.type || entry.type === options.type)
    && (!options.targetType || entry.targetType === options.targetType)
    && (!options.operator || entry.operator === options.operator);
}

async function main() {
  const mode = process.argv[2];
  const fixture = readOption("--fixture");
  if (!fixture || !["snapshot", "verify"].includes(mode)) usage();
  const root = path.resolve(fixture);

  if (mode === "snapshot") {
    const result = await snapshot(root);
    const output = readOption("--output");
    if (output) {
      await mkdir(path.dirname(path.resolve(output)), { recursive: true });
      await writeFile(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
    return;
  }

  const baselinePath = readOption("--baseline");
  if (!baselinePath) usage();
  const baseline = JSON.parse(await readFile(path.resolve(baselinePath), "utf8"));
  const current = await snapshot(root);
  assert.deepEqual(current.protectedFiles, baseline.protectedFiles, "Protected business files changed, were added, or were removed");
  assert.equal(current.protectedFileCount, baseline.protectedFileCount, "Protected business file count changed");
  assert.equal(current.protectedHash, baseline.protectedHash, "Protected business hash changed");

  const baselineAudit = new Map((baseline.auditEntries ?? []).map((entry) => [entry.id, entry]));
  const currentAudit = new Map(current.auditEntries.map((entry) => [entry.id, entry]));
  for (const [id, entry] of baselineAudit) assert.deepEqual(currentAudit.get(id), entry, `Baseline audit entry changed or was removed: ${id}`);
  const addedAudit = current.auditEntries.filter((entry) => !baselineAudit.has(entry.id));
  const maxAdded = Number(readOption("--allow-audit-max-added") ?? 0);
  assert.ok(Number.isInteger(maxAdded) && maxAdded >= 0, "--allow-audit-max-added must be a non-negative integer");
  assert.ok(addedAudit.length <= maxAdded, `Unexpected audit entry count: ${addedAudit.length}`);
  const allow = {
    type: readOption("--allow-audit-type"),
    targetType: readOption("--allow-audit-target-type"),
    operator: readOption("--allow-audit-operator")
  };
  for (const entry of addedAudit) assert.ok(allowedAudit(entry, allow), `Unexpected audit entry: ${entry.id}`);

  console.log(JSON.stringify({
    protectedFileCount: current.protectedFileCount,
    protectedHash: current.protectedHash,
    addedAuditCount: addedAudit.length,
    addedAudit: addedAudit.map(({ id, createdAt, type, targetType, operator }) => ({ id, createdAt, type, targetType, operator }))
  }, null, 2));
}

await main();
