import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { microStore } from "@/services/microStandardService";
import { markdownKnowledgeWriteService } from "@/services/markdownKnowledgeWriteService";
import type { MarkdownKnowledgeImportInput, MarkdownKnowledgeInput } from "@/types/markdownKnowledge";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await microStore().list()); }
  catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "微规范目录不可用。" }, { status: 503 }); }
}
export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    await microStore().list();
    const body = await request.json() as MarkdownKnowledgeInput & { sourceFileName?: string };
    const input = { ...body, documentType: "micro-spec" as const };
    const result = body.sourceFileName ? await markdownKnowledgeWriteService.importMarkdown({ ...input, fileName: body.sourceFileName } as MarkdownKnowledgeImportInput) : await markdownKnowledgeWriteService.create(input);
    return NextResponse.json(result, { status: 201 });
  } catch (e) { return NextResponse.json({ message: e instanceof Error ? e.message : "保存失败。" }, { status: 400 }); }
}
