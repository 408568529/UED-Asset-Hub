import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { isFontFile, saveFontFile } from "@/lib/fontStorage";
import { fontService } from "@/services/fontService";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await fontService.getFontVersions(decodeURIComponent(id)));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const font = await fontService.getFontById(decodeURIComponent(id));
  if (!font) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || !isFontFile(file)) return NextResponse.json({ message: "字体文件格式仅支持 otf、ttf、woff、woff2、zip" }, { status: 400 });
  const version = String(formData.get("version") ?? "v1.0.0");
  let filePath = "";
  try {
    filePath = await saveFontFile(file, font.name, version);
    const result = await fontService.addVersion(font.id, version, filePath, file);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: filePath ? "文件已保存，但字体版本记录写入失败，请检查 DATA_DIR 权限。" : "字体文件保存失败，请检查 DATA_DIR 权限。" },
      { status: 500 }
    );
  }
}
