import { NextResponse } from "next/server";
import { moduleService } from "@/services/moduleService";

export async function GET() {
  return NextResponse.json(await moduleService.getOpenModuleSummaries());
}
