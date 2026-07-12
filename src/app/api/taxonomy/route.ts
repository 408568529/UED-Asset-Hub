import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { taxonomyService } from "@/services/taxonomyService";
import { taxonomyTypes, type TaxonomyDeleteRequest, type TaxonomyType } from "@/types/taxonomy";

function getType(value: unknown): TaxonomyType | null {
  return taxonomyTypes.includes(value as TaxonomyType) ? value as TaxonomyType : null;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const type = getType(params.get("type"));
  if (!type) return NextResponse.json({ message: "Unsupported taxonomy type" }, { status: 400 });
  return NextResponse.json(await taxonomyService.getItems(type, params.get("q") ?? undefined));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { type?: string; name?: string };
    const type = getType(body.type);
    if (!type || !body.name?.trim()) return NextResponse.json({ message: "类型和名称为必填项。" }, { status: 400 });
    return NextResponse.json(await taxonomyService.createItem(type, body.name), { status: 201 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "创建基础数据失败。" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { type?: string; id?: string; name?: string };
    const type = getType(body.type);
    if (!type || !body.id || !body.name?.trim()) return NextResponse.json({ message: "类型、ID 和名称为必填项。" }, { status: 400 });
    const item = await taxonomyService.renameItem(type, body.id, body.name);
    return item ? NextResponse.json(item) : NextResponse.json({ message: "选项不存在。" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "重命名失败。" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json() as { type?: string; id?: string; request?: TaxonomyDeleteRequest };
    const type = getType(body.type);
    if (!type || !body.id || !body.request) return NextResponse.json({ message: "删除参数不完整。" }, { status: 400 });
    return NextResponse.json(await taxonomyService.deleteItem(type, body.id, body.request));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "删除失败。" }, { status: 400 });
  }
}
