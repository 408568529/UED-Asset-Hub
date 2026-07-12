import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { trainingService } from "@/services/trainingService";

export async function GET(request: Request) { return NextResponse.json(await trainingService.getTopics(new URL(request.url).searchParams.get("groupId") ?? undefined)); }

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { groupId?: string; name?: string };
  if (!body.groupId || !body.name?.trim()) return NextResponse.json({ message: "Group and topic name are required" }, { status: 400 });
  try { return NextResponse.json(await trainingService.createTopic(body.groupId, body.name), { status: 201 }); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Topic create failed" }, { status: 400 }); }
}
