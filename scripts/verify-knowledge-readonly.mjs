import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dataRoot = await mkdtemp(path.join(os.tmpdir(), "ued-knowledge-readonly-data-"));
const moduleRoot = await mkdtemp(path.join(os.tmpdir(), "ued-knowledge-readonly-module-"));
process.env.DATA_DIR = dataRoot;

try {
  const sourceRoot = path.join(process.cwd(), "src");
  const storageSource = await readFile(path.join(sourceRoot, "lib/storage/jsonStorage.ts"), "utf8");
  await writeFile(path.join(moduleRoot, "storage.ts"), await readFile(path.join(sourceRoot, "config/storage.ts"), "utf8"), "utf8");
  await writeFile(path.join(moduleRoot, "jsonStorage.ts"), storageSource.replace('"@/config/storage"', '"./storage.ts"'), "utf8");
  const storage = await import(pathToFileURL(path.join(moduleRoot, "jsonStorage.ts")).href);

  assert.deepEqual(await storage.readJsonFileReadonly("missing.json", []), []);
  assert.equal(existsSync(path.join(dataRoot, "meta")), false, "missing reads must not create meta");

  await writeFile(path.join(dataRoot, "legacy.json"), "[{\"id\":\"legacy\"}]\n", "utf8");
  assert.deepEqual(await storage.readJsonFileReadonly("legacy.json", []), [{ id: "legacy" }]);
  assert.equal(existsSync(path.join(dataRoot, "meta", "legacy.json")), false, "legacy reads must not copy data");

  await mkdir(path.join(dataRoot, "meta"));
  await writeFile(path.join(dataRoot, "meta", "current.json"), "[{\"id\":\"current\"}]\n", "utf8");
  const before = await readFile(path.join(dataRoot, "meta", "current.json"), "utf8");
  assert.deepEqual(await storage.readJsonFileReadonly("current.json", []), [{ id: "current" }]);
  assert.equal(await readFile(path.join(dataRoot, "meta", "current.json"), "utf8"), before, "current reads must not rewrite data");

  console.log("[knowledge] read-only storage verification passed.");
} finally {
  await Promise.all([rm(dataRoot, { recursive: true, force: true }), rm(moduleRoot, { recursive: true, force: true })]);
}
