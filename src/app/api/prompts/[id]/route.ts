import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { promptService } from "@/services/promptService";
import type { PromptDifficulty, PromptInput, PromptModel, PromptOutputType } from "@/types/prompt";

function parseList(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeInput(body: Partial<PromptInput>): PromptInput {
  return {
    name: String(body.name ?? ""),
    summary: String(body.summary ?? ""),
    cover: String(body.cover ?? ""),
    category: String(body.category ?? "通用 Prompt"),
    tags: parseList(body.tags),
    author: String(body.author ?? "admin"),
    version: String(body.version ?? "v1.0.0"),
    models: parseList(body.models) as PromptModel[],
    scenarios: parseList(body.scenarios),
    outputTypes: parseList(body.outputTypes) as PromptOutputType[],
    difficulty: (body.difficulty ?? "初级") as PromptDifficulty,
    rating: Number(body.rating ?? 5),
    content: String(body.content ?? ""),
    usageGuide: String(body.usageGuide ?? ""),
    exampleInput: String(body.exampleInput ?? ""),
    exampleOutput: String(body.exampleOutput ?? "")
  };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const result = await promptService.updatePrompt(decodeURIComponent(id), normalizeInput(await request.json()));
  if (!result) return NextResponse.json({ message: "Not found" }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  return NextResponse.json(await promptService.deletePrompt(decodeURIComponent(id)));
}
