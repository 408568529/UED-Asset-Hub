import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { trainingService } from "@/services/trainingService";
import type { TrainingVideoInput } from "@/types/training";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await trainingService.getVideoById(decodeURIComponent(id));
  return video ? NextResponse.json(video) : NextResponse.json({ message: "Not found" }, { status: 404 });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await trainingService.updateVideo(decodeURIComponent(id), await request.json() as TrainingVideoInput);
  return result ? NextResponse.json(result) : NextResponse.json({ message: "Not found" }, { status: 404 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const deleteFile = new URL(request.url).searchParams.get("deleteFile") === "true";
  return NextResponse.json(await trainingService.deleteVideo(decodeURIComponent(id), { deleteFile }));
}
