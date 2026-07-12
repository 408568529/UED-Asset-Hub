export type FontCategory = "中文字体" | "英文字体" | "等宽字体" | "图标字体" | "品牌字体" | "数字字体";

export interface FontAsset {
  id: string;
  name: string;
  description: string;
  category: FontCategory;
  cover?: string;
  designer?: string;
  officialUrl?: string;
  license?: string;
  version: string;
  tags: string[];
  tagIds?: string[];
  sortOrder?: number;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileFormat: string;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FontVersion {
  id: string;
  fontId: string;
  version: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileFormat: string;
  operator: string;
  createdAt: string;
  downloadCount: number;
}

export type FontInput = Pick<FontAsset, "name" | "description" | "category" | "cover" | "designer" | "officialUrl" | "license" | "version" | "tags" | "sortOrder">;
