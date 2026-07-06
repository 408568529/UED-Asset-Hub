import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { isFontFile, saveFontFile } from "@/lib/fontStorage";
import { fontService } from "@/services/fontService";
import type { FontCategory, FontInput } from "@/types/font";

const categories: FontCategory[] = ["中文字体", "英文字体", "等宽字体", "图标字体", "品牌字体", "数字字体"];

function parseTags(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function parseSortOrder(value: FormDataEntryValue | null) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && String(value ?? "").trim() ? numberValue : undefined;
}

function getInput(formData: FormData): FontInput {
  const category = String(formData.get("category") ?? "中文字体") as FontCategory;
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: categories.includes(category) ? category : "中文字体",
    cover: String(formData.get("cover") ?? ""),
    designer: String(formData.get("designer") ?? ""),
    officialUrl: String(formData.get("officialUrl") ?? ""),
    license: String(formData.get("license") ?? ""),
    version: String(formData.get("version") ?? "v1.0.0"),
    tags: parseTags(formData.get("tags")),
    sortOrder: parseSortOrder(formData.get("sortOrder"))
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(await fontService.getFonts(searchParams.get("q") ?? undefined));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || !isFontFile(file)) return NextResponse.json({ message: "字体文件格式仅支持 otf、ttf、woff、woff2、zip" }, { status: 400 });
  const input = getInput(formData);
  let filePath = "";
  try {
    filePath = await saveFontFile(file, input.name, input.version);
    const result = await fontService.createFont(input, filePath, file);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: filePath ? "文件已保存，但字体记录写入失败，请检查 DATA_DIR 权限。" : "字体文件保存失败，请检查 DATA_DIR 权限。" },
      { status: 500 }
    );
  }
}
