import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR, storageFolders } from "@/config/storage";

export function sanitizePathName(name: string) {
  return name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "") || "skill";
}

export async function saveSkillPackage(file: File, skillName: string, version: string) {
  const safeSkillName = sanitizePathName(skillName);
  const safeVersion = sanitizePathName(version);
  const relativeDir = path.join(storageFolders.skill, safeSkillName, safeVersion);
  const dir = path.join(DATA_DIR, relativeDir);
  await fs.mkdir(dir, { recursive: true });
  const packagePath = path.join(dir, "skill.zip");
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(packagePath, buffer);
  return path.join(relativeDir, "skill.zip");
}

export function isZipFile(file: File) {
  return file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed";
}
