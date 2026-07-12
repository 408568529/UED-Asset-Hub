import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR, TRAINING_LIBRARY_DIR, TRAINING_MEDIA_DIR, TRAINING_UPLOAD_DIR, shouldMigrateLegacyTrainingMedia, storageFolders } from "@/config/storage";
import { sanitizeFileName, sanitizePathName } from "@/lib/fileUpload";
import type { TrainingServerFile, TrainingVideoInput } from "@/types/training";

const videoExtensions = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogg"]);
const coverExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const legacyTrainingMediaDir = path.join(DATA_DIR, "training-media");
const uploadedPrefix = "uploaded:";

async function ensureTrainingMediaLayout() {
  if (shouldMigrateLegacyTrainingMedia) {
    const [legacy, target] = await Promise.all([fs.stat(legacyTrainingMediaDir).catch(() => null), fs.stat(TRAINING_MEDIA_DIR).catch(() => null)]);
    if (legacy?.isDirectory() && !target) await fs.rename(legacyTrainingMediaDir, TRAINING_MEDIA_DIR);
  }
  await fs.mkdir(TRAINING_MEDIA_DIR, { recursive: true });
  await fs.mkdir(TRAINING_UPLOAD_DIR, { recursive: true });
  await fs.mkdir(TRAINING_LIBRARY_DIR, { recursive: true });
  for (const entry of await fs.readdir(TRAINING_MEDIA_DIR, { withFileTypes: true })) {
    if (["uploaded", "library"].includes(entry.name)) continue;
    const source = path.join(TRAINING_MEDIA_DIR, entry.name);
    const target = path.join(TRAINING_LIBRARY_DIR, entry.name);
    if (!(await fs.stat(target).catch(() => null))) await fs.rename(source, target);
  }
}

function assertInside(root: string, target: string) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("文件路径超出允许目录。");
}

export function isSupportedVideoName(fileName: string) {
  return videoExtensions.has(path.extname(fileName).toLowerCase());
}

export function isSupportedCover(file: File) {
  return coverExtensions.has(path.extname(file.name).toLowerCase()) && ["image/jpeg", "image/png", "image/webp", ""].includes(file.type);
}

export async function prepareTrainingUploadPath(input: TrainingVideoInput, videoId: string, fileName: string) {
  if (!isSupportedVideoName(fileName)) throw new Error("仅支持 MP4、WebM、MOV、M4V 或 OGG 视频。");
  await ensureTrainingMediaLayout();
  const relativeDir = path.join(
    sanitizePathName(input.groupName),
    sanitizePathName(videoId)
  );
  const absoluteDir = path.join(TRAINING_UPLOAD_DIR, relativeDir);
  assertInside(TRAINING_UPLOAD_DIR, absoluteDir);
  await fs.mkdir(absoluteDir, { recursive: true });
  const safeFileName = sanitizeFileName(fileName) || "training-video.mp4";
  return {
    relativePath: `${uploadedPrefix}${path.join(relativeDir, safeFileName)}`,
    absolutePath: path.join(absoluteDir, safeFileName),
    temporaryPath: path.join(absoluteDir, `${safeFileName}.uploading`)
  };
}

export async function saveTrainingCover(videoId: string, videoPath: string, file: File) {
  if (!isSupportedCover(file)) throw new Error("封面仅支持 JPG、PNG 或 WebP。");
  if (videoPath.startsWith("server-local:")) {
    const relativeDir = path.join(storageFolders.training, "covers", sanitizePathName(videoId));
    const absoluteDir = path.join(DATA_DIR, relativeDir);
    await fs.mkdir(absoluteDir, { recursive: true });
    const fileName = `cover${path.extname(file.name).toLowerCase()}`;
    const absolutePath = path.join(absoluteDir, fileName);
    await fs.writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));
    return path.join(relativeDir, fileName);
  }
  const absoluteVideoPath = resolveTrainingVideoPath(videoPath);
  const relativeDir = videoPath.startsWith(uploadedPrefix) ? `${uploadedPrefix}${path.dirname(videoPath.slice(uploadedPrefix.length))}` : path.dirname(videoPath);
  const absoluteDir = path.dirname(absoluteVideoPath);
  const fileName = `cover${path.extname(file.name).toLowerCase()}`;
  await fs.writeFile(path.join(absoluteDir, fileName), Buffer.from(await file.arrayBuffer()));
  return relativeDir.startsWith(uploadedPrefix) ? `${relativeDir}/${fileName}` : path.join(relativeDir, fileName);
}

export function resolveTrainingVideoPath(storedPath: string) {
  if (storedPath.startsWith("server-local:")) {
    const relativePath = storedPath.slice("server-local:".length);
    const absolutePath = path.resolve(TRAINING_LIBRARY_DIR, relativePath);
    assertInside(path.resolve(TRAINING_LIBRARY_DIR), absolutePath);
    return absolutePath;
  }
  if (storedPath.startsWith(uploadedPrefix)) {
    const absolutePath = path.resolve(TRAINING_UPLOAD_DIR, storedPath.slice(uploadedPrefix.length));
    assertInside(path.resolve(TRAINING_UPLOAD_DIR), absolutePath);
    return absolutePath;
  }
  const absolutePath = path.resolve(DATA_DIR, storedPath);
  assertInside(path.resolve(DATA_DIR, storageFolders.training), absolutePath);
  return absolutePath;
}

export function resolveTrainingCoverPath(storedPath: string) {
  if (storedPath.startsWith(uploadedPrefix)) {
    const absolutePath = path.resolve(TRAINING_UPLOAD_DIR, storedPath.slice(uploadedPrefix.length));
    assertInside(path.resolve(TRAINING_UPLOAD_DIR), absolutePath);
    return absolutePath;
  }
  const absolutePath = path.resolve(DATA_DIR, storedPath);
  assertInside(path.resolve(DATA_DIR, storageFolders.training), absolutePath);
  return absolutePath;
}

export async function removeTrainingVideoFiles(videoPath: string, coverPath?: string) {
  if (videoPath.startsWith("server-local:")) {
    if (coverPath) await fs.rm(resolveTrainingCoverPath(coverPath), { force: true });
    return;
  }
  const videoFile = resolveTrainingVideoPath(videoPath);
  await fs.rm(path.dirname(videoFile), { recursive: true, force: true });
}

export async function removeLinkedServerFile(videoPath: string) {
  if (!videoPath.startsWith("server-local:")) return;
  await fs.rm(resolveTrainingVideoPath(videoPath), { force: true });
}

export async function listTrainingServerFiles(): Promise<TrainingServerFile[]> {
  await ensureTrainingMediaLayout();
  const root = path.resolve(TRAINING_LIBRARY_DIR);
  const pending = [root];
  const files: TrainingServerFile[] = [];
  while (pending.length) {
    const current = pending.pop() as string;
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      assertInside(root, absolutePath);
      if (entry.isDirectory()) {
        pending.push(absolutePath);
      } else if (entry.isFile() && isSupportedVideoName(entry.name)) {
        const stat = await fs.stat(absolutePath);
        files.push({
          relativePath: path.relative(root, absolutePath),
          fileName: entry.name,
          fileSize: stat.size,
          updatedAt: stat.mtime.toISOString()
        });
      }
    }
  }
  return files.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export async function getLinkedServerFile(relativePath: string) {
  await ensureTrainingMediaLayout();
  const absolutePath = path.resolve(TRAINING_LIBRARY_DIR, relativePath);
  assertInside(path.resolve(TRAINING_LIBRARY_DIR), absolutePath);
  if (!isSupportedVideoName(absolutePath)) throw new Error("文件格式不受支持。");
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile()) throw new Error("服务器文件不存在。");
  return { absolutePath, fileName: path.basename(absolutePath), fileSize: stat.size, storedPath: `server-local:${path.relative(TRAINING_LIBRARY_DIR, absolutePath)}` };
}
