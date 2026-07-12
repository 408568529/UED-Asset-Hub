import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { isZipFile, saveSkillPackage } from "@/lib/skillStorage";
import { skillService } from "@/services/skillService";
import type { SkillCategory, SkillInput } from "@/types/skill";

function parseTags(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function getInput(formData: FormData): SkillInput {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    cover: String(formData.get("cover") ?? ""),
    category: (String(formData.get("category") ?? "Other") || "Other") as SkillCategory,
    version: String(formData.get("version") ?? "v1.0.0"),
    authorName: String(formData.get("authorName") ?? formData.get("author") ?? "").trim() || "未填写作者",
    usageScenarios: parseTags(formData.get("usageScenarios")),
    tags: parseTags(formData.get("tags")),
    readme: String(formData.get("readme") ?? ""),
    changeLog: String(formData.get("changeLog") ?? "上传新版本")
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(await skillService.getSkills(searchParams.get("q") ?? undefined));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("package");
  if (!(file instanceof File) || !isZipFile(file)) return NextResponse.json({ message: "Skill package must be a ZIP file" }, { status: 400 });
  const input = getInput(formData);
  let packagePath = "";
  try {
    packagePath = await saveSkillPackage(file, input.name, input.version);
    const result = await skillService.createSkill(input, packagePath, file);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: packagePath ? "文件已保存，但 Skill 记录写入失败，请检查 DATA_DIR 权限。" : "Skill 文件保存失败，请检查 DATA_DIR 权限。" },
      { status: 500 }
    );
  }
}
