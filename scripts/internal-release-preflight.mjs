import { access, constants, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHostPorts } from "./runtime-ports.mjs";

const directoryNames = [
  "DATA_DIR",
  "TRAINING_MEDIA_DIR",
  "AGENT_RUNTIME_DIR",
  "ASSET_HUB_RUNTIME_DIR",
  "DSH_SOURCE_DIR",
  "DSH_RUNTIME_SOURCE_DIR"
];

function fail(message) { throw new Error(`[INTERNAL_RELEASE_PREFLIGHT] ${message}`); }

async function inspectDirectory(name, value, { writable }) {
  if (typeof value !== "string" || !value.trim()) fail(`missing required ${name}.`);
  if (!path.isAbsolute(value)) fail(`${name} must be an absolute path.`);
  const absolute = path.resolve(value);
  let details;
  try { details = await lstat(absolute); } catch { fail(`${name} does not exist.`); }
  if (!details.isDirectory() || details.isSymbolicLink()) fail(`${name} must be a real directory, not a link.`);
  const canonical = await realpath(absolute);
  try { await access(canonical, writable ? constants.R_OK | constants.W_OK : constants.R_OK); } catch { fail(`${name} lacks required ${writable ? "read/write" : "read"} access.`); }
  return canonical;
}

function overlap(left, right) {
  const a = path.relative(left, right);
  const b = path.relative(right, left);
  const isWithin = (relative) => relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  return isWithin(a) || isWithin(b);
}

export async function validateInternalRuntimeEnvironment(environment = process.env, releaseRoot = process.cwd()) {
  const ports = resolveHostPorts(environment);
  const roots = {};
  for (const name of directoryNames) roots[name] = await inspectDirectory(name, environment[name], { writable: name !== "DSH_SOURCE_DIR" });
  if (environment.MICRO_STANDARD_ROOT) roots.MICRO_STANDARD_ROOT = await inspectDirectory("MICRO_STANDARD_ROOT", environment.MICRO_STANDARD_ROOT, { writable: true });
  const haldurRoot = environment.HALDUR_DESIGN_SKILL_ROOT?.trim();
  const haldurRuntimeRoot = environment.HALDUR_DESIGN_SKILL_RUNTIME_ROOT?.trim();
  if (Boolean(haldurRoot) !== Boolean(haldurRuntimeRoot)) fail("HALDUR_DESIGN_SKILL_ROOT and HALDUR_DESIGN_SKILL_RUNTIME_ROOT must be configured together.");
  if (haldurRoot) {
    roots.HALDUR_DESIGN_SKILL_ROOT = await inspectDirectory("HALDUR_DESIGN_SKILL_ROOT", haldurRoot, { writable: true });
    roots.HALDUR_DESIGN_SKILL_RUNTIME_ROOT = await inspectDirectory("HALDUR_DESIGN_SKILL_RUNTIME_ROOT", haldurRuntimeRoot, { writable: true });
  }
  const codeRoot = await realpath(path.resolve(releaseRoot));
  for (const [name, root] of Object.entries(roots)) if (overlap(codeRoot, root)) fail(`${name} must be outside the release code directory.`);
  const entries = Object.entries(roots);
  for (let index = 0; index < entries.length; index++) {
    for (let other = index + 1; other < entries.length; other++) {
      if (overlap(entries[index][1], entries[other][1])) fail(`${entries[index][0]} and ${entries[other][0]} must be separate.`);
    }
  }
  return { result: "PASS", configuredRoots: Object.keys(roots), ports };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const releaseRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
    const result = await validateInternalRuntimeEnvironment(process.env, releaseRoot);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
