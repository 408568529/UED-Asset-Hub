import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/config/storage";

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);

  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      await writeJsonFile(fileName, fallback);
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile<T>(fileName: string, data: T): Promise<void> {
  await ensureDataDir();
  const filePath = path.join(DATA_DIR, fileName);
  const tempPath = `${filePath}.tmp`;

  await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}
