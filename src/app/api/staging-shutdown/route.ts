import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { acceptsSameOriginJsonMutation, invokeRuntimeShutdown } from "@/lib/runtimeControl";

export const dynamic = "force-dynamic";

let shutdownScheduled = false;

export async function POST(request: Request) {
  if (process.env.UED_STAGING_SHUTDOWN_ENABLED !== "true") return NextResponse.json({ message: "Not found." }, { status: 404 });
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (!acceptsSameOriginJsonMutation(request)) return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  if (shutdownScheduled) return NextResponse.json({ status: "already_scheduled" }, { status: 202, headers: { "Cache-Control": "no-store" } });

  shutdownScheduled = true;
  setTimeout(() => {
    void invokeRuntimeShutdown().catch(() => { shutdownScheduled = false; });
  }, 500);
  return NextResponse.json({ status: "accepted" }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
