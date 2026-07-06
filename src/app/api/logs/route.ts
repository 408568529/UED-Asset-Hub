import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { operationLogService } from "@/services/operationLogService";
import type { OperationLog } from "@/types/audit";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  return NextResponse.json(await operationLogService.getLogs(limit ? Number(limit) : undefined));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Omit<OperationLog, "id" | "createdAt">;
  return NextResponse.json(await operationLogService.createLog(body), { status: 201 });
}
