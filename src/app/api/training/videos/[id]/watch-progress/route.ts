import { NextResponse } from "next/server";
import { trainingAnalyticsService } from "@/services/trainingAnalyticsService";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json() as { sessionId?: string; currentTime?: number; watchedSeconds?: number };
  if (!body.sessionId || !Number.isFinite(body.currentTime) || !Number.isFinite(body.watchedSeconds)) return NextResponse.json({ message: "Invalid watch progress" }, { status: 400 });
  const metrics = await trainingAnalyticsService.reportWatchProgress({ videoId: decodeURIComponent(id), sessionId: body.sessionId, currentTime: Number(body.currentTime), watchedSeconds: Number(body.watchedSeconds) });
  return metrics ? NextResponse.json(metrics) : NextResponse.json({ message: "Not found" }, { status: 404 });
}
