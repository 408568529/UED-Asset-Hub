import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { skillService } from "@/services/skillService";
import type { SkillInput } from "@/types/skill";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await skillService.updateSkill(decodeURIComponent(id), (await request.json()) as SkillInput);
  if (!result) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await skillService.deleteSkill(decodeURIComponent(id)));
}
