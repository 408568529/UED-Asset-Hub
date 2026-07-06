import { NextResponse } from "next/server";
import { moduleService } from "@/services/moduleService";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await moduleService.getOpenModuleSummaries());
}
