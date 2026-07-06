import { NextResponse } from "next/server";
import { assetVersionService } from "@/services/assetVersionService";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const version = await assetVersionService.getVersionById(id);
  if (!version) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(version);
}
