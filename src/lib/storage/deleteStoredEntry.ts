import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/config/storage";

function sanitizePathName(name: string) {
  return name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "") || "unclassified";
}

function resolveSafeDataPath(relativePath: string) {
  const dataRoot = path.resolve(DATA_DIR);
  const targetPath = path.resolve(DATA_DIR, relativePath);
  if (targetPath !== dataRoot && !targetPath.startsWith(`${dataRoot}${path.sep}`)) {
    throw new Error("Refuse to delete path outside DATA_DIR.");
  }
  return targetPath;
}

async function removeDataPath(relativePath: string) {
  await fs.rm(resolveSafeDataPath(relativePath), { recursive: true, force: true });
}

export async function removeStoredModuleEntry(moduleFolder: string, assetName?: string) {
  if (!assetName) return;
  await removeDataPath(path.join(moduleFolder, sanitizePathName(assetName)));
}

export async function removeStoredAssetFoldersFromPaths(moduleFolder: string, storedPaths: Array<string | undefined>, fallbackAssetName?: string) {
  const folders = new Set<string>();

  for (const storedPath of storedPaths) {
    if (!storedPath) continue;
    const parts = storedPath.split(/[\\/]+/).filter(Boolean);
    const moduleIndex = parts.indexOf(moduleFolder);
    const assetFolder = moduleIndex >= 0 ? parts[moduleIndex + 1] : undefined;
    if (assetFolder) folders.add(path.join(moduleFolder, assetFolder));
  }

  if (!folders.size && fallbackAssetName) {
    folders.add(path.join(moduleFolder, sanitizePathName(fallbackAssetName)));
  }

  await Promise.all([...folders].map(removeDataPath));
}
