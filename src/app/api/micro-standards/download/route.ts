import archiver from "archiver";
import { PassThrough, Readable } from "node:stream";
import { NextResponse } from "next/server";
import { microStore } from "@/services/microStandardService";
import { microStandardExportEntries } from "@/services/microStandardExportService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Matches the existing public micro-standards read access. Writes remain admin-only.
export async function GET(request: Request) {
  try {
    const topic = new URL(request.url).searchParams.get("topic") ?? undefined;
    const entries = await microStandardExportEntries(microStore(), topic);
    const archive = archiver("zip", { zlib: { level: 6 } });
    const output = new PassThrough();
    archive.on("error", error => output.destroy(error));
    output.on("close", () => archive.abort());
    archive.pipe(output);
    for (const entry of entries) archive.append(entry.content, { name: entry.name });
    void archive.finalize().catch(error => output.destroy(error));
    return new Response(Readable.toWeb(output) as ReadableStream<Uint8Array>, { headers: {
      "content-type": "application/zip", "content-disposition": 'attachment; filename="Micro-Standards.zip"',
      "cache-control": "no-store", "x-content-type-options": "nosniff"
    } });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "下载微规范失败。" }, { status: 409 });
  }
}
