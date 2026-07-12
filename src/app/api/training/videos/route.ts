import { NextResponse } from "next/server";
import { trainingService } from "@/services/trainingService";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return NextResponse.json(await trainingService.getVideos({ keyword: params.get("q") ?? undefined, groupId: params.get("groupId") ?? undefined }));
}
