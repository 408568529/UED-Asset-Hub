import { access, lstat, mkdir, open, readdir, realpath, rename, rmdir, statfs, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyPreparedProfile } from "./competition-dependency-tree.mjs";

const dataChildren = Object.freeze({
  MICRO_STANDARD_ROOT: "micro-standards", DATA_DIR: "hub-data", TRAINING_MEDIA_DIR: "training-media", AGENT_RUNTIME_DIR: "agent-runtime",
  ASSET_HUB_RUNTIME_DIR: "asset-hub-runtime", HALDUR_DESIGN_SKILL_ROOT: "Haldur-Design-Skill",
  HALDUR_DESIGN_SKILL_RUNTIME_ROOT: "haldur-runtime"
});
const portDefaults = Object.freeze({ HOST_PORT: "3247", HOST_INTERNAL_PORT: "3248", DSH_PORT: "3347", AGENT_PROXY_PORT: "3348", KNOWLEDGE_GATEWAY_MCP_PORT: "3349" });
const within = (parent, child) => { const part = path.relative(parent, child); return part === "" || (part !== ".." && !part.startsWith(`..${path.sep}`) && !path.isAbsolute(part)); };
const overlaps = (a, b) => within(a, b) || within(b, a);

export async function assertNoLinkedAncestors(value) {
  let current = path.resolve(value);
  for (;;) {
    try { if ((await lstat(current)).isSymbolicLink()) throw new Error("A setup path traverses a link or junction."); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

export async function initializeCompetitionData({ packageRoot, dependencyRoot, dataRoot, confirmed = false }) {
  if (!confirmed) throw new Error("Explicit confirmation of the new data directory is required.");
  for (const value of [packageRoot, dependencyRoot, dataRoot]) if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error("Setup paths must be absolute.");
  const code = path.resolve(packageRoot), dependencies = path.resolve(dependencyRoot), data = path.resolve(dataRoot);
  if (overlaps(code, data) || overlaps(dependencies, data)) throw new Error("Data must be separate from program and dependency directories.");
  if (process.platform === "win32" && path.parse(data).root.toLowerCase() === `${(process.env.SystemDrive || "C:").toLowerCase()}\\`) throw new Error("Choose a data directory outside the system drive.");
  for (const target of [code, dependencies, data]) await assertNoLinkedAncestors(target);
  await Promise.all([access(code, constants.R_OK), access(dependencies, constants.R_OK), access(path.dirname(data), constants.R_OK | constants.W_OK)]);
  // Inspect dependency roots before any data write; preparation never compiles on the user's machine.
  for (const name of ["dsh-source", "dsh-runtime"]) {
    const target = path.join(dependencies, name);
    await assertNoLinkedAncestors(target);
    if (!(await lstat(target)).isDirectory()) throw new Error("Prepared Windows DSH dependencies are missing.");
  }
  const seed = path.join(dependencies, "genui-home");
  const visited = new Set();
  const inspectSeed = async (directory) => {
    const physical = await realpath(directory);
    if (visited.has(physical)) return;
    visited.add(physical);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if ((/^\.env(?:\.|$)/i.test(entry.name) && entry.name !== ".env.example") || /^\.credentials/i.test(entry.name)) throw new Error("The prepared profile contains forbidden user state.");
      const canonical = await realpath(file);
      if (!within(dependencies, canonical)) throw new Error("A prepared profile link escapes the dependency package.");
      if ((await lstat(canonical)).isDirectory() && within(seed, canonical)) await inspectSeed(file);
    }
  };
  await assertNoLinkedAncestors(seed);
  await inspectSeed(seed);
  for (const entry of await readdir(seed)) if (!["profiles", "genui-packages", ".agent-presets"].includes(entry)) throw new Error("The prepared profile must contain only plugin dependencies and restricted presets.");
  await access(path.join(seed, "profiles", "web", "node_modules", "dsh-plugin-genui", "package.json"));
  try {
    await lstat(data);
    throw new Error("Existing data found. Use the existing installation configuration; no data was changed.");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const space = await statfs(path.dirname(data));
  if (Number(space.bavail) * Number(space.bsize) < 1024 ** 3) throw new Error("At least 1 GiB of free data space is required.");
  const created = [];
  try {
    await mkdir(data, { mode: 0o700 }); created.push(data);
    const marker = await open(path.join(data, ".setup-in-progress.json"), "wx", 0o600);
    try { await marker.writeFile(JSON.stringify({ schemaVersion: 1, phase: "creating-directories" }) + "\n"); }
    finally { await marker.close(); }
    for (const name of [...Object.values(dataChildren), "config"]) {
      const child = path.join(data, name);
      await mkdir(child, { mode: 0o700 }); created.push(child);
    }
    await writeFile(path.join(data, "micro-standards", ".micro-index.json"), JSON.stringify({ schemaVersion: 1, revision: 0, topics: [], documents: {} }) + "\n", { flag: "wx", mode: 0o600 });
    await copyPreparedProfile(seed, path.join(data, "agent-runtime", "dsh-home"), path.join(dependencies, "dsh-runtime"));
    const environment = Object.fromEntries(Object.entries(dataChildren).map(([key, name]) => [key, path.join(data, name)]));
    Object.assign(environment, { AGENT_PUBLIC_ACCESS: "true", DSH_SOURCE_DIR: path.join(dependencies, "dsh-source"), DSH_RUNTIME_SOURCE_DIR: path.join(dependencies, "dsh-runtime") }, portDefaults);
    const configPath = path.join(data, "config", "runtime.json");
    await writeFile(configPath, JSON.stringify(environment, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await writeFile(path.join(data, "config", "installation.json"), JSON.stringify({ schemaVersion: 1, packageRoot: code, dataRoot: data, configPath }, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    await writeFile(path.join(data, ".setup-in-progress.json"), JSON.stringify({ schemaVersion: 1, phase: "directories-and-profile-prepared" }) + "\n");
    await rename(path.join(data, ".setup-in-progress.json"), path.join(data, "config", "setup-receipt.json"));
    // No credentials, sessions, knowledge samples or fabricated indices are generated here.
    return { configPath, dataRoot: data, environment };
  } catch (error) {
    // Keep marker/configuration for diagnosis. Never recursively remove a selected directory.
    for (const child of created.reverse()) try { await rmdir(child); } catch {}
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [action, packageRoot, dataRoot] = process.argv.slice(2);
    if (action !== "init" || !dataRoot) throw new Error("Use init <package-root> <explicitly-confirmed-new-data-root>.");
    const result = await initializeCompetitionData({ packageRoot, dependencyRoot: path.join(packageRoot, "dependencies"), dataRoot, confirmed: true });
    process.stdout.write(JSON.stringify({ configPath: result.configPath, dataRoot: result.dataRoot }) + "\n");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
