import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import type { UploadRecord } from "@/types/audit";

const FILE_NAME = "uploads.json";

export const uploadRecordService = {
  async getUploads(limit?: number): Promise<UploadRecord[]> {
    const uploads = await readJsonFile<UploadRecord[]>(FILE_NAME, []);
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
