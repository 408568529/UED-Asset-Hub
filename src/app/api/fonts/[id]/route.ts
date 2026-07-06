import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { fontService } from "@/services/fontService";
import type { FontInput } from "@/types/font";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await fontService.updateFont(decodeURIComponent(id), (await request.json()) as FontInput);
  if (!result) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await fontService.deleteFont(decodeURIComponent(id)));
}
