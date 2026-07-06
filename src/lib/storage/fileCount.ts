import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/config/storage";

export async function countStoredEntries(folderName: string): Promise<number> {
  try {
    const entries = await fs.readdir(path.join(DATA_DIR, folderName), { withFileTypes: true });
    return entries.filter((entry) => !entry.name.startsWith(".")).length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}
