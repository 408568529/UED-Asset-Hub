import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { saveTrainingCover } from "@/lib/trainingStorage";
import { trainingService } from "@/services/trainingService";

const contentTypes: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await trainingService.getCoverFile(decodeURIComponent(id));
  if (!file) return new NextResponse(null, { status: 404 });
  try {
    return new NextResponse(await fs.readFile(file.absolutePath), { headers: { "Content-Type": contentTypes[path.extname(file.absolutePath).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "public, max-age=3600" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const video = await trainingService.getVideoById(decodeURIComponent(id));
  if (!video) return NextResponse.json({ message: "Not found" }, { status: 404 });
  try {
    const formData = await request.formData();
    const file = formData.get("cover");
    if (!(file instanceof File)) return NextResponse.json({ message: "Cover file is required" }, { status: 400 });
    const coverPath = await saveTrainingCover(video.id, video.videoPath, file);
    return NextResponse.json(await trainingService.updateCover(video.id, coverPath));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "封面上传失败。" }, { status: 400 });
  }
}
