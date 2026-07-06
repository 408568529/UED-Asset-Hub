import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR, storageFolders } from "@/config/storage";
import { sanitizeFileName, sanitizePathName } from "@/lib/fileUpload";

const fontExtensions = [".otf", ".ttf", ".woff", ".woff2", ".zip"];

export function getFontFormat(fileName: string) {
  return path.extname(fileName).replace(".", "").toLowerCase() || "unknown";
}

export function isFontFile(file: File) {
  return fontExtensions.includes(path.extname(file.name).toLowerCase());
}

export async function saveFontFile(file: File, fontName: string, version: string) {
  const relativeDir = path.join(storageFolders.font, sanitizePathName(fontName), sanitizePathName(version));
  const dir = path.join(DATA_DIR, relativeDir);
  await fs.mkdir(dir, { recursive: true });
  const fileName = sanitizeFileName(file.name);
  const filePath = path.join(dir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return path.join(relativeDir, fileName);
}
