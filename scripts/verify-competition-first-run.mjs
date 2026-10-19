import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeCompetitionData } from "./competition-first-run.mjs";

const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "ued-v25-first-run-")));
try {
  const packageRoot = path.join(root, "程序 含空格"), dependencyRoot = path.join(packageRoot, "dependencies");
  await mkdir(path.join(dependencyRoot, "dsh-source"), { recursive: true });
  await mkdir(path.join(dependencyRoot, "dsh-runtime"));
  const plugin = path.join(dependencyRoot, "genui-home", "profiles", "web", "node_modules", "dsh-plugin-genui");
  await mkdir(plugin, { recursive: true });
  await writeFile(path.join(plugin, "package.json"), JSON.stringify({ name: "dsh-plugin-genui", version: "0.15.1" }));
  const dataRoot = path.join(root, "持久数据 O'Brien"), options = { packageRoot, dependencyRoot, dataRoot, confirmed: true };
  await assert.rejects(initializeCompetitionData({ ...options, confirmed: false }), /confirmation/);
  await assert.rejects(initializeCompetitionData({ ...options, dataRoot: path.join(packageRoot, "data") }), /separate/);
  const result = await initializeCompetitionData(options);
  const config = await readFile(result.configPath, "utf8");
  assert.ok(config.includes("O''Brien"));
  assert.ok(!/API_KEY|PASSWORD|SESSION_SECRET/.test(config));
  assert.equal(JSON.parse(await readFile(path.join(dataRoot, "agent-runtime", "dsh-home", "profiles", "web", "node_modules", "dsh-plugin-genui", "package.json"), "utf8")).version, "0.15.1");
  assert.equal((await readdir(result.environment.DATA_DIR)).length, 0);
  await writeFile(path.join(dataRoot, "keep.txt"), "existing-user-data");
  await assert.rejects(initializeCompetitionData(options), /Existing data/);
  assert.equal(await readFile(path.join(dataRoot, "keep.txt"), "utf8"), "existing-user-data");
  await rm(result.environment.TRAINING_MEDIA_DIR, { recursive: true });
  await assert.rejects(initializeCompetitionData(options), /Existing data/);
  await assert.rejects(access(result.environment.TRAINING_MEDIA_DIR), { code: "ENOENT" });
  const linked = path.join(root, "linked-parent");
  await symlink(packageRoot, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(initializeCompetitionData({ ...options, dataRoot: path.join(linked, "new-data") }), /link|separate/);
  console.log("[V2.5] first-run consent, Chinese/spaced paths, quoting, empty storage, existing data, missing roots and linked paths: PASS");
} finally { await rm(root, { recursive: true, force: true }); }
