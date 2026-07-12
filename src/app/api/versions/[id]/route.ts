import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { assetVersionService } from "@/services/assetVersionService";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const version = await assetVersionService.getVersionById(id);
  if (!version) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(version);
}
