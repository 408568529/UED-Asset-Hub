import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { testEnvironmentService } from "@/services/testEnvironmentService";
import type { TestEnvironmentInput } from "@/types/testEnvironment";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const result = await testEnvironmentService.updateEnvironment(decodeURIComponent(id), await request.json() as TestEnvironmentInput);
    return result ? NextResponse.json(result) : NextResponse.json({ message: "Not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "测试环境保存失败。" }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await testEnvironmentService.deleteEnvironment(decodeURIComponent(id)));
}
