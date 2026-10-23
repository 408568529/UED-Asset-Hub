import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { microStore } from "@/services/microStandardService";
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { action: "create" | "rename" | "delete"; name: string; next?: string };
    if (!["create", "rename", "delete"].includes(body.action)) throw Error("无效操作。");
    await microStore().topic(body.action, body.name, body.next);
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "主题操作失败。" }, { status: 409 }); }
}
