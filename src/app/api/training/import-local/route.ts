import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { trainingService } from "@/services/trainingService";
import type { TrainingVideoInput } from "@/types/training";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { input: TrainingVideoInput; relativePath: string };
    if (!body.relativePath) return NextResponse.json({ message: "请选择服务器媒体目录中的视频。" }, { status: 400 });
    return NextResponse.json(await trainingService.importServerFile(body.input, body.relativePath), { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "服务器视频关联失败。" }, { status: 400 });
  }
}
