import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { deleteCredential, getModelSettings, saveModelSettings, testDeepSeekConnection } from "@/lib/dshModelSettings";

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "模型设置请求失败。";
  return NextResponse.json({ message }, { status: 400 });
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getModelSettings());
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { action?: unknown; apiKey?: unknown; baseUrl?: unknown; model?: unknown };
    if (body.action === "save") return NextResponse.json(await saveModelSettings(body));
    if (body.action === "delete") return NextResponse.json(await deleteCredential());
    if (body.action === "test") return NextResponse.json(await testDeepSeekConnection(body));
    return NextResponse.json({ message: "不支持的模型设置操作。" }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}
