import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR, storageFolders } from "@/config/storage";

type UploadModule = keyof typeof storageFolders;

export function getFileType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".md") return "md";
  if (ext === ".json") return "json";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) return "image";
  return "other";
}

export function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-");
}

export function sanitizePathName(name: string) {
  return name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "") || "unclassified";
}

export async function saveUploadFile(file: File, options?: { module?: UploadModule; assetName?: string }) {
  const moduleName = options?.module && options.module !== "uploads" ? options.module : undefined;
  const assetFolder = sanitizePathName(options?.assetName ?? "");
  const relativeDir = moduleName
    ? path.join(storageFolders[moduleName], assetFolder)
    : path.join(storageFolders.uploads, "unclassified");
  const uploadDir = path.join(DATA_DIR, relativeDir);
  await fs.mkdir(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${sanitizeFileName(file.name)}`;
  const filePath = path.join(uploadDir, safeName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return path.join(relativeDir, safeName);
}
