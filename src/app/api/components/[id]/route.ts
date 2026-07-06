import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { componentSpecService } from "@/services/componentSpecService";
import type { ComponentSpecInput } from "@/types/componentSpec";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const component = await componentSpecService.updateComponent(id, (await request.json()) as ComponentSpecInput);
  if (!component) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(component);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await componentSpecService.deleteComponent(id));
}
