import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { trainingService } from "@/services/trainingService";

export async function GET(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { taskId } = await params;
  const task = await trainingService.getUploadTask(decodeURIComponent(taskId));
  return task ? NextResponse.json(task) : NextResponse.json({ message: "Not found" }, { status: 404 });
}
