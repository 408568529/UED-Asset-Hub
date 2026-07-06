import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/adminAuth";
import { getFileType, saveUploadFile } from "@/lib/fileUpload";
import { uploadRecordService } from "@/services/uploadRecordService";
import type { UploadRecord } from "@/types/audit";

const uploadModules = ["product", "component", "sop", "skill", "font", "prompt"] as const;

function getAssetModule(value: FormDataEntryValue | null): UploadRecord["assetModule"] {
  const assetModule = String(value ?? "");
  return uploadModules.includes(assetModule as (typeof uploadModules)[number]) ? assetModule as UploadRecord["assetModule"] : undefined;
}

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

  const assetModule = getAssetModule(formData.get("assetModule"));
  const relatedAssetName = String(formData.get("relatedAssetName") ?? "") || undefined;
  let storagePath = "";
  try {
    storagePath = await saveUploadFile(file, { module: assetModule, assetName: relatedAssetName });
    const record = await uploadRecordService.createUpload({
      fileName: file.name,
      fileType: getFileType(file.name),
      assetModule,
      relatedAssetId: String(formData.get("relatedAssetId") ?? "") || undefined,
      relatedAssetName,
      operator: "admin",
      status: "success",
      summary: String(formData.get("summary") ?? "") || "文件已上传到本地存储。",
      storagePath
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { message: storagePath ? "文件已保存，但上传记录写入失败，请检查 DATA_DIR 权限。" : "文件保存失败，请检查 DATA_DIR 权限。" },
      { status: 500 }
    );
  }
}
