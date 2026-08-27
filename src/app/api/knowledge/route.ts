import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { markdownKnowledgeService } from "@/services/markdownKnowledgeService";
import { MarkdownKnowledgeWriteError, markdownKnowledgeWriteService } from "@/services/markdownKnowledgeWriteService";
import type { MarkdownKnowledgeImportInput, MarkdownKnowledgeInput } from "@/types/markdownKnowledge";

export async function GET() {
  return NextResponse.json(await markdownKnowledgeService.list());
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as MarkdownKnowledgeInput & { sourceFileName?: string };
    const result = body.sourceFileName
      ? await markdownKnowledgeWriteService.importMarkdown({ ...body, documentType: "micro-spec", fileName: body.sourceFileName } as MarkdownKnowledgeImportInput)
      : await markdownKnowledgeWriteService.create(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof MarkdownKnowledgeWriteError ? 400 : 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Knowledge 文档创建失败。" }, { status });
  }
}
