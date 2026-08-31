import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ASSET_HUB_RUNTIME_DIR, DATA_DIR } from "@/config/storage";

const writeQueues = new Map<string, Promise<void>>();

function isInside(parentPath: string, candidatePath: string) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function canonicalPath(value: string) {
  const resolved = path.resolve(value);
  return fs.realpath(resolved).catch(() => resolved);
}

async function assertOperationalRoot() {
  const runtimeRoot = path.resolve(ASSET_HUB_RUNTIME_DIR);
  const dataRoot = path.resolve(DATA_DIR);
  const repoRoot = path.resolve(process.cwd());
  const dshRoot = process.env.DSH_SOURCE_DIR ? path.resolve(process.env.DSH_SOURCE_DIR) : null;
  const agentRoot = process.env.AGENT_RUNTIME_DIR ? path.resolve(process.env.AGENT_RUNTIME_DIR) : null;
  if (runtimeRoot === dataRoot || isInside(runtimeRoot, dataRoot) || isInside(dataRoot, runtimeRoot)) throw new Error("ASSET_HUB_RUNTIME_DIR must be separate from DATA_DIR.");
  if (runtimeRoot === repoRoot || isInside(runtimeRoot, repoRoot) || isInside(repoRoot, runtimeRoot)) throw new Error("ASSET_HUB_RUNTIME_DIR must be separate from the repository.");
  if (dshRoot && (runtimeRoot === dshRoot || isInside(runtimeRoot, dshRoot) || isInside(dshRoot, runtimeRoot))) throw new Error("ASSET_HUB_RUNTIME_DIR must be separate from DSH source.");
  if (agentRoot && (runtimeRoot === agentRoot || isInside(runtimeRoot, agentRoot) || isInside(agentRoot, runtimeRoot))) throw new Error("ASSET_HUB_RUNTIME_DIR must be separate from AGENT_RUNTIME_DIR.");
  const [canonicalRuntime, canonicalData, canonicalRepo, canonicalDsh, canonicalAgent] = await Promise.all([
    canonicalPath(runtimeRoot), canonicalPath(dataRoot), canonicalPath(repoRoot), dshRoot ? canonicalPath(dshRoot) : null, agentRoot ? canonicalPath(agentRoot) : null
  ]);
  if (canonicalRuntime === canonicalData || isInside(canonicalRuntime, canonicalData) || isInside(canonicalData, canonicalRuntime)) throw new Error("ASSET_HUB_RUNTIME_DIR must be separate from DATA_DIR.");
  if (canonicalRuntime === canonicalRepo || isInside(canonicalRuntime, canonicalRepo) || isInside(canonicalRepo, canonicalRuntime)) throw new Error("ASSET_HUB_RUNTIME_DIR must be separate from the repository.");
  if (canonicalDsh && (canonicalRuntime === canonicalDsh || isInside(canonicalRuntime, canonicalDsh) || isInside(canonicalDsh, canonicalRuntime))) throw new Error("ASSET_HUB_RUNTIME_DIR must be separate from DSH source.");
  if (canonicalAgent && (canonicalRuntime === canonicalAgent || isInside(canonicalRuntime, canonicalAgent) || isInside(canonicalAgent, canonicalRuntime))) throw new Error("ASSET_HUB_RUNTIME_DIR must be separate from AGENT_RUNTIME_DIR.");
  return runtimeRoot;
}

async function filePath(section: string, fileName: string) {
  if (!/^[a-z0-9-]+$/i.test(section) || !/^[a-z0-9-]+\.json$/i.test(fileName)) throw new Error("Invalid operational storage path.");
  const root = await assertOperationalRoot();
  const target = path.resolve(root, section, fileName);
  if (!isInside(root, target)) throw new Error("Operational storage path escaped its root.");
  return target;
}

async function ensureParent(target: string) {
  const root = await assertOperationalRoot();
  await fs.mkdir(path.dirname(target), { recursive: true });
  const [canonicalRoot, canonicalParent] = await Promise.all([fs.realpath(root), fs.realpath(path.dirname(target))]);
  if (!isInside(canonicalRoot, canonicalParent)) throw new Error("Operational storage parent escaped its root.");
}

function enqueueWrite(target: string, action: () => Promise<void>) {
  const previous = writeQueues.get(target) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  writeQueues.set(target, next);
  return next.finally(() => {
    if (writeQueues.get(target) === next) writeQueues.delete(target);
  });
}

export async function readOperationalJson<T>(section: string, fileName: string, fallback: T): Promise<T> {
  const target = await filePath(section, fileName);
  try {
    return JSON.parse(await fs.readFile(target, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeOperationalJson<T>(section: string, fileName: string, value: T): Promise<void> {
  const target = await filePath(section, fileName);
  await enqueueWrite(target, async () => {
    await ensureParent(target);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
  });
}
