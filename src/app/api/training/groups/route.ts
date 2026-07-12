import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { trainingService } from "@/services/trainingService";

export async function GET() { return NextResponse.json(await trainingService.getFolders()); }

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { name?: string };
  if (!body.name?.trim()) return NextResponse.json({ message: "Group name is required" }, { status: 400 });
  return NextResponse.json(await trainingService.createGroup(body.name), { status: 201 });
}
