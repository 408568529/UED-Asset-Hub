import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { testEnvironmentService } from "@/services/testEnvironmentService";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== "string")) {
    return NextResponse.json({ message: "排序数据无效。" }, { status: 400 });
  }

  const result = await testEnvironmentService.reorderEnvironments(body.ids, "admin");
  return result ? NextResponse.json(result) : NextResponse.json({ message: "排序数据与当前测试环境不一致，请刷新后重试。" }, { status: 409 });
}
