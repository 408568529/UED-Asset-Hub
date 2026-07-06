export type LogType = "create" | "update" | "delete" | "upload" | "version" | "login" | "logout";
export type TargetType = "asset" | "version" | "file" | "auth" | "system";
export type AssetVersionType = "product" | "component";

export interface OperationLog {
  id: string;
  type: LogType;
  title: string;
  description: string;
  targetType: TargetType;
  targetId?: string;
  targetName?: string;
  operator: string;
  createdAt: string;
  diffSummary?: string[];
}

export interface UploadRecord {
  id: string;
  fileName: string;
  fileType: "md" | "image" | "json" | "other";
  relatedAssetId?: string;
  relatedAssetName?: string;
  operator: string;
  uploadedAt: string;
  status: "success" | "failed";
  summary?: string;
  storagePath?: string;
}

export interface AssetVersion {
  id: string;
  assetType: AssetVersionType;
  assetId: string;
  version: string;
  title: string;
  contentSnapshot: string;
  changeSummary: string[];
  operator: string;
  createdAt: string;
}
