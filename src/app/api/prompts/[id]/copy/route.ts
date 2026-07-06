import { NextResponse } from "next/server";
import { promptService } from "@/services/promptService";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prompt = await promptService.incrementCopy(decodeURIComponent(id));
  if (!prompt) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json({ copyCount: prompt.copyCount });
}
