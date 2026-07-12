import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { testEnvironmentService } from "@/services/testEnvironmentService";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({})) as { action?: "reveal" | "copy-password" };
    const result = await testEnvironmentService.revealPassword(decodeURIComponent(id), "admin", body.action ?? "reveal");
    return result === null ? NextResponse.json({ message: "Not found" }, { status: 404 }) : NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "密码读取失败。" }, { status: 400 });
  }
}
