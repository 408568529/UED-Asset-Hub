import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { listTrainingServerFiles } from "@/lib/trainingStorage";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await listTrainingServerFiles());
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "服务器媒体目录读取失败。" }, { status: 500 });
  }
}
