import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { trainingAnalyticsService } from "@/services/trainingAnalyticsService";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const metrics = await trainingAnalyticsService.getVideoMetrics(decodeURIComponent(id));
  return metrics ? NextResponse.json(metrics) : NextResponse.json({ message: "Not found" }, { status: 404 });
}
