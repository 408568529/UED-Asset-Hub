import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { microStore } from "@/services/microStandardService";
import { markdownKnowledgeWriteService } from "@/services/markdownKnowledgeWriteService";
import type { MarkdownKnowledgeInput } from "@/types/markdownKnowledge";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const doc = await microStore().get((await params).id);
    if (!doc) return NextResponse.json({ message: "Not found" }, { status: 404 });
    if (new URL(request.url).searchParams.has("download")) return new Response(doc.content, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.metadata.title + ".md")}`, "X-Content-Type-Options": "nosniff" } });
    return NextResponse.json(doc);
  } catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "读取失败。" }, { status: 400 }); }
}
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const id = (await params).id;
    if (!await microStore().get(id)) return NextResponse.json({ message: "Not found" }, { status: 404 });
    const input = await request.json() as MarkdownKnowledgeInput;
    if (!Number.isSafeInteger(input.revision)) throw Error("请刷新文档后再保存，缺少版本信息。");
    return NextResponse.json(await markdownKnowledgeWriteService.update(id, { ...input, documentType: "micro-spec" }));
  } catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "保存失败。" }, { status: 409 }); }
}
