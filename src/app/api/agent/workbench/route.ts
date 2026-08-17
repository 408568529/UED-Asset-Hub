import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "未登录或登录已失效。" }, { status: 401 });
  return NextResponse.json({ url: new URL("/agent-runtime/", request.url).toString() });
}
