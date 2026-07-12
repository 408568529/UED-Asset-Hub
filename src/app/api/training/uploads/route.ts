import { promises as fs } from "node:fs";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { prepareTrainingUploadPath } from "@/lib/trainingStorage";
import { trainingService } from "@/services/trainingService";
import { uploadRecordService } from "@/services/uploadRecordService";
import type { TrainingUploadTask, TrainingVideoInput } from "@/types/training";

export const runtime = "nodejs";

function decodeHeader(value: string | null, fallback = "") {
  try { return decodeURIComponent(value ?? fallback); } catch { return fallback; }
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const taskId = request.headers.get("x-upload-task-id") || `training-upload-${Date.now()}`;
  const fileName = decodeHeader(request.headers.get("x-file-name"), "training-video.mp4");
  const totalBytes = Number(request.headers.get("content-length") ?? 0);
  let temporaryPath = "";
  let uploadedBytes = 0;
  let fileHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
  const now = new Date().toISOString();

  try {
    const metadata = JSON.parse(decodeHeader(request.headers.get("x-training-metadata"))) as TrainingVideoInput;
    if (!metadata.title?.trim() || !metadata.groupName?.trim()) throw new Error("视频标题和所属文件夹为必填项。");
    if (!request.body) throw new Error("未收到视频文件内容。");
    const paths = await prepareTrainingUploadPath(metadata, taskId, fileName);
    temporaryPath = paths.temporaryPath;
    const task: TrainingUploadTask = { id: taskId, fileName, status: "uploading", uploadedBytes: 0, totalBytes, createdAt: now, updatedAt: now };
    await trainingService.upsertUploadTask(task);

    fileHandle = await fs.open(paths.temporaryPath, "w");
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await fileHandle.write(value);
        uploadedBytes += value.byteLength;
      }
    }
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = null;
    await trainingService.upsertUploadTask({ ...task, status: "processing", uploadedBytes, updatedAt: new Date().toISOString() });
    await fs.rename(paths.temporaryPath, paths.absolutePath);
    temporaryPath = "";
    const result = await trainingService.createVideo(metadata, { videoPath: paths.relativePath, fileName, fileSize: uploadedBytes, sourceMode: "upload" });
    await trainingService.upsertUploadTask({ ...task, status: "success", uploadedBytes, totalBytes: totalBytes || uploadedBytes, videoId: result.data.id, updatedAt: new Date().toISOString() });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    await fileHandle?.close().catch(() => undefined);
    if (temporaryPath) await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    const failureReason = error instanceof Error ? error.message : "培训视频上传失败。";
    await trainingService.upsertUploadTask({ id: taskId, fileName, status: "failed", uploadedBytes, totalBytes, failureReason, createdAt: now, updatedAt: new Date().toISOString() }).catch(() => undefined);
    await uploadRecordService.createUpload({ fileName, fileType: "other", fileSize: totalBytes, assetModule: "training", operator: "admin", status: "failed", uploadMode: "upload", summary: "培训视频上传失败", failureReason }).catch(() => undefined);
    return NextResponse.json({ message: failureReason, taskId }, { status: 400 });
  }
}
