import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { sopService } from "@/services/sopService";
import type { SopInput } from "@/types/sop";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(await sopService.getSops(searchParams.get("q") ?? undefined));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const result = await sopService.createSop((await request.json()) as SopInput);
  return NextResponse.json(result, { status: 201 });
}
