import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { getFileType, saveUploadFile } from "@/lib/fileUpload";
import { uploadRecordService } from "@/services/uploadRecordService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  return NextResponse.json(await uploadRecordService.getUploads(limit ? Number(limit) : undefined));
}

export async function POST(request: Request) {
  if (!isAdminRequest(request)) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "File is required" }, { status: 400 });
  }

  const storagePath = await saveUploadFile(file);
  const record = await uploadRecordService.createUpload({
    fileName: file.name,
    fileType: getFileType(file.name),
    relatedAssetId: String(formData.get("relatedAssetId") ?? "") || undefined,
    relatedAssetName: String(formData.get("relatedAssetName") ?? "") || undefined,
    operator: "admin",
    status: "success",
    summary: String(formData.get("summary") ?? "") || "文件已上传到本地存储。",
    storagePath
  });

  return NextResponse.json(record, { status: 201 });
}
