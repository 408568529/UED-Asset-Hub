import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/config/storage";

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

export async function saveUploadFile(file: File) {
  const uploadDir = path.join(DATA_DIR, "upload-files");
  await fs.mkdir(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${sanitizeFileName(file.name)}`;
  const filePath = path.join(uploadDir, safeName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return filePath;
}
