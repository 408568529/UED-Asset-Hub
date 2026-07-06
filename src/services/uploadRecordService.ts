import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import type { UploadRecord } from "@/types/audit";

const FILE_NAME = "uploads.json";
type LegacyUploadRecord = Partial<UploadRecord> & { createdAt?: string; uploadedBy?: string; fileType?: string; status?: string };
const validFileTypes: UploadRecord["fileType"][] = ["md", "image", "json", "other"];

function normalizeUpload(upload: LegacyUploadRecord): UploadRecord {
  const fileType = validFileTypes.includes(upload.fileType as UploadRecord["fileType"])
    ? upload.fileType as UploadRecord["fileType"]
    : "other";

  return {
    id: upload.id ?? `upload-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: upload.fileName ?? "未命名文件",
    fileType,
    assetModule: upload.assetModule,
    relatedAssetId: upload.relatedAssetId,
    relatedAssetName: upload.relatedAssetName,
    operator: upload.operator ?? upload.uploadedBy ?? "unknown",
    uploadedAt: upload.uploadedAt ?? upload.createdAt ?? new Date(0).toISOString(),
    status: upload.status === "failed" ? "failed" : "success",
    summary: upload.summary,
    storagePath: upload.storagePath
  };
}

export const uploadRecordService = {
  async getUploads(limit?: number): Promise<UploadRecord[]> {
    const uploads = (await readJsonFile<LegacyUploadRecord[]>(FILE_NAME, [])).map(normalizeUpload);
    const result = uploads.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));
    return limit ? result.slice(0, limit) : result;
  },

  async createUpload(input: Omit<UploadRecord, "id" | "uploadedAt"> & { uploadedAt?: string }): Promise<UploadRecord> {
    const uploads = await readJsonFile<UploadRecord[]>(FILE_NAME, []);
    const upload: UploadRecord = {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      uploadedAt: input.uploadedAt ?? new Date().toISOString(),
      ...input
    };
    await writeJsonFile(FILE_NAME, [upload, ...uploads]);
    return upload;
  }
};
