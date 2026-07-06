import { NextResponse } from "next/server";
import { fontService } from "@/services/fontService";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const versionId = searchParams.get("versionId") ?? undefined;
  const isPreview = searchParams.get("preview") === "1";
  const font = await fontService.getFontById(decodeURIComponent(id));
  if (!font) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const versions = await fontService.getFontVersions(font.id);
  const version = versionId ? versions.find((item) => item.id === versionId) : versions[0];
  const filePath = version?.filePath ?? font.filePath;
  const fileName = version?.fileName ?? font.fileName;
  const file = await fontService.readFile(filePath);
  if (!isPreview) await fontService.incrementDownload(font.id, version?.id);
  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `${isPreview ? "inline" : "attachment"}; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    }
  });
}
