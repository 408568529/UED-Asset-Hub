import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { testEnvironmentService } from "@/services/testEnvironmentService";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action !== "copy-username") return NextResponse.json({ message: "Unsupported action" }, { status: 400 });
  const { id } = await params;
  const created = await testEnvironmentService.logUsernameCopy(decodeURIComponent(id));
  return created ? NextResponse.json({ logged: true }) : NextResponse.json({ message: "Not found" }, { status: 404 });
}
