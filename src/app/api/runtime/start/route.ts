import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { acceptsSameOriginJsonMutation, invokeRuntimeControl } from "@/lib/runtimeControl";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!acceptsSameOriginJsonMutation(request)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  try {
    return NextResponse.json({ runtime: await invokeRuntimeControl("start") }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ message: "Runtime control failed." }, { status: 503 });
  }
}
