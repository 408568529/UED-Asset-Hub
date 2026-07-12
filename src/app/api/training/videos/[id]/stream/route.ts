import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { trainingService } from "@/services/trainingService";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".ogg": "video/ogg" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = await trainingService.getVideoFile(decodeURIComponent(id));
  if (!file) return new NextResponse(null, { status: 404 });
  try {
    const stat = await fs.stat(file.absolutePath);
    const type = contentTypes[path.extname(file.absolutePath).toLowerCase()] ?? "application/octet-stream";
    const range = request.headers.get("range");
    if (!range) {
      const stream = Readable.toWeb(createReadStream(file.absolutePath)) as ReadableStream;
      return new NextResponse(stream, { headers: { "Content-Type": type, "Content-Length": String(stat.size), "Accept-Ranges": "bytes" } });
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${stat.size}` } });
    const stream = Readable.toWeb(createReadStream(file.absolutePath, { start, end })) as ReadableStream;
    return new NextResponse(stream, { status: 206, headers: { "Content-Type": type, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes" } });
  } catch { return new NextResponse(null, { status: 404 }); }
}
