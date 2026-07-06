import path from "node:path";
import { NextResponse } from "next/server";
import { skillService } from "@/services/skillService";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get("versionId") ?? undefined;
  const skill = await skillService.getSkillById(decodeURIComponent(id));
  if (!skill) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const versions = await skillService.getSkillVersions(skill.id);
  const version = versionId ? versions.find((item) => item.id === versionId) : versions[0];
  const packagePath = version?.packagePath ?? skill.packagePath;
  const file = await skillService.readPackage(packagePath);
  await skillService.incrementDownload(skill.id, version?.id);
  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(path.basename(packagePath))}"`
    }
  });
}
