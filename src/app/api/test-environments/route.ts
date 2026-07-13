import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { testEnvironmentService } from "@/services/testEnvironmentService";
import type { TestEnvironmentInput } from "@/types/testEnvironment";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const keyword = new URL(request.url).searchParams.get("q") ?? undefined;
  return NextResponse.json(await testEnvironmentService.getEnvironments(keyword));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await testEnvironmentService.createEnvironment(await request.json() as TestEnvironmentInput), { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "测试环境创建失败。" }, { status: 400 });
  }
}
