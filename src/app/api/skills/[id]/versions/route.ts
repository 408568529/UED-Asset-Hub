import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { isZipFile, saveSkillPackage } from "@/lib/skillStorage";
import { skillService } from "@/services/skillService";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await skillService.getSkillVersions(decodeURIComponent(id)));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const skill = await skillService.getSkillById(decodeURIComponent(id));
  if (!skill) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const formData = await request.formData();
  const file = formData.get("package");
  if (!(file instanceof File) || !isZipFile(file)) return NextResponse.json({ message: "Skill package must be a ZIP file" }, { status: 400 });
  const version = String(formData.get("version") ?? "v1.0.0");
  const packagePath = await saveSkillPackage(file, skill.name, version);
  const updateType = String(formData.get("updateType") ?? "version");
  const result = updateType === "overwrite"
    ? await skillService.overwriteCurrentVersion(skill.id, version, packagePath, file, String(formData.get("changeLog") ?? "覆盖上传当前版本"), String(formData.get("readme") ?? ""))
    : await skillService.addVersion(skill.id, version, packagePath, file, String(formData.get("changeLog") ?? "上传新版本"), String(formData.get("readme") ?? ""));
  return NextResponse.json(result, { status: 201 });
}
