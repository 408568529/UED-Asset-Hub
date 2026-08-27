import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { MarkdownKnowledgePathError, markdownKnowledgeService } from "@/services/markdownKnowledgeService";
import { MarkdownKnowledgeWriteError, markdownKnowledgeWriteService } from "@/services/markdownKnowledgeWriteService";
import type { MarkdownKnowledgeInput } from "@/types/markdownKnowledge";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = await markdownKnowledgeService.getById(decodeURIComponent(id));
    return result ? NextResponse.json(result) : NextResponse.json({ message: "Not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Knowledge 文档读取失败。" }, { status: error instanceof MarkdownKnowledgePathError ? 400 : 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const result = await markdownKnowledgeWriteService.update(decodeURIComponent(id), await request.json() as MarkdownKnowledgeInput);
    return result ? NextResponse.json(result) : NextResponse.json({ message: "Not found" }, { status: 404 });
  } catch (error) {
    const status = error instanceof MarkdownKnowledgeWriteError || error instanceof MarkdownKnowledgePathError ? 400 : 500;
    return NextResponse.json({ message: error instanceof Error ? error.message : "Knowledge 文档保存失败。" }, { status });
  }
}
