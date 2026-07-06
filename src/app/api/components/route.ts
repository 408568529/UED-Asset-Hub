import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { componentSpecService } from "@/services/componentSpecService";
import type { ComponentSpecInput } from "@/types/componentSpec";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(await componentSpecService.getComponents(searchParams.get("q") ?? undefined));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as ComponentSpecInput;
  const result = await componentSpecService.createComponent(body);
  return NextResponse.json(result, { status: 201 });
}
