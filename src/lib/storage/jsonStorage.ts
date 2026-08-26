import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_DIR, META_DIR } from "@/config/storage";

async function ensureDataDir() {
  await fs.mkdir(META_DIR, { recursive: true });
}

const writeQueues = new Map<string, Promise<void>>();

function enqueueWrite(fileName: string, action: () => Promise<void>) {
  const previous = writeQueues.get(fileName) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  writeQueues.set(fileName, next);
  return next.finally(() => {
    if (writeQueues.get(fileName) === next) writeQueues.delete(fileName);
  });
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  await ensureDataDir();
  const filePath = path.join(META_DIR, fileName);
  const legacyPath = path.join(DATA_DIR, fileName);

  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      try {
        const legacyContent = await fs.readFile(legacyPath, "utf8");
        const legacyData = JSON.parse(legacyContent) as T;
        await writeJsonFile(fileName, legacyData);
        return legacyData;
      } catch (legacyError) {
        if ((legacyError as NodeJS.ErrnoException).code !== "ENOENT") throw legacyError;
      }
      await writeJsonFile(fileName, fallback);
      return fallback;
    }
    throw error;
  }
}

/**
 * Reads the current or legacy JSON file without creating directories, copying
 * legacy data, or persisting a fallback. Use this for read-only projections.
 */
export async function readJsonFileReadonly<T>(fileName: string, fallback: T): Promise<T> {
  const filePath = path.join(META_DIR, fileName);
  const legacyPath = path.join(DATA_DIR, fileName);

  for (const candidate of [filePath, legacyPath]) {
    try {
      return JSON.parse(await fs.readFile(candidate, "utf8")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  return fallback;
}

export async function writeJsonFile<T>(fileName: string, data: T): Promise<void> {
  await enqueueWrite(fileName, async () => {
    await ensureDataDir();
    const filePath = path.join(META_DIR, fileName);
    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
      await fs.rename(tempPath, filePath);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  });
}
