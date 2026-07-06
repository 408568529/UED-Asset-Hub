import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { sopService } from "@/services/sopService";
import type { SopInput } from "@/types/sop";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await sopService.updateSop(decodeURIComponent(id), (await request.json()) as SopInput);
  if (!result) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await sopService.deleteSop(decodeURIComponent(id)));
}
