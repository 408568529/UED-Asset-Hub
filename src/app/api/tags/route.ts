import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { tagService } from "@/services/tagService";
import { componentSpecService } from "@/services/componentSpecService";
import { fontService } from "@/services/fontService";
import { productService } from "@/services/productService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";
import { testEnvironmentService } from "@/services/testEnvironmentService";
import { trainingService } from "@/services/trainingService";
import { tagTypes, type TagType } from "@/types/tag";

function getTagType(value: string | null): TagType | null {
  return tagTypes.includes(value as TagType) ? value as TagType : null;
}

async function getUsedNames(type: TagType) {
  switch (type) {
    case "skill-usage": return (await skillService.getSkills()).flatMap((item) => item.usageScenarios);
    case "skill-tag": return (await skillService.getSkills()).flatMap((item) => item.tags);
    case "prompt-usage": return (await promptService.getPrompts()).flatMap((item) => item.scenarios);
    case "prompt-tag": return (await promptService.getPrompts()).flatMap((item) => item.tags);
    case "font-tag": return (await fontService.getFonts()).flatMap((item) => item.tags);
    case "training-tag": return (await trainingService.getVideos()).flatMap((item) => item.tags);
    case "test-environment-tag": return (await testEnvironmentService.getEnvironments()).flatMap((item) => item.tags);
    case "product-tag": return (await productService.getProducts()).flatMap((item) => item.tags);
    case "component-tag": return (await componentSpecService.getComponents()).flatMap((item) => item.tags);
    case "sop-tag": return (await sopService.getSops()).flatMap((item) => item.tags);
  }
}

export async function GET(request: Request) {
  const type = getTagType(new URL(request.url).searchParams.get("type"));
  if (!type) return NextResponse.json({ message: "Unsupported tag type" }, { status: 400 });
  const usedNames = (await getUsedNames(type)).filter((name): name is string => Boolean(name));
  await tagService.syncTagsByType(type, usedNames);
  return NextResponse.json(await tagService.getTagsByType(type));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { type?: string; name?: string };
  const type = getTagType(body.type ?? null);
  if (!type || !body.name?.trim()) return NextResponse.json({ message: "Tag type and name are required" }, { status: 400 });
  return NextResponse.json(await tagService.createTag(type, body.name), { status: 201 });
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await request.json() as { id?: string; name?: string };
  if (!body.id || !body.name?.trim()) return NextResponse.json({ message: "Tag id and name are required" }, { status: 400 });
  const tag = await tagService.updateTag(body.id, body.name);
  return tag ? NextResponse.json(tag) : NextResponse.json({ message: "Not found" }, { status: 404 });
}

export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Tag id is required" }, { status: 400 });
  return NextResponse.json({ deleted: await tagService.deleteTag(id) });
}
