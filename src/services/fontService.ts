import { promises as fs } from "node:fs";
import { resolveDataPath, storageFolders } from "@/config/storage";
import { getFontFormat } from "@/lib/fontStorage";
import { removeStoredAssetFoldersFromPaths } from "@/lib/storage/deleteStoredEntry";
import { readJsonFileForMutation, readJsonFileReadonly, writeJsonFile } from "@/lib/storage/jsonStorage";
import { operationLogService } from "@/services/operationLogService";
import { operationalStateService } from "@/services/operationalStateService";
import { uploadRecordService } from "@/services/uploadRecordService";
import type { DeleteResult, MutationResult } from "@/types/serviceResult";
import type { FontAsset, FontInput, FontVersion } from "@/types/font";

const FONTS_FILE = "fonts.json";
const FONT_VERSIONS_FILE = "font-versions.json";

function createId(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
}

function sortFonts(a: FontAsset, b: FontAsset) {
  return (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

function matchesKeyword(font: FontAsset, keyword?: string) {
  if (!keyword) return true;
  return `${font.name} ${font.description} ${font.category} ${font.designer ?? ""} ${font.tags.join(" ")}`.toLowerCase().includes(keyword.toLowerCase());
}

async function getFontsWithReader(reader: typeof readJsonFileForMutation, keyword?: string) {
  const fonts = await Promise.all((await reader<FontAsset[]>(FONTS_FILE, [])).map(async (font) => {
    const counters = await operationalStateService.downloadCounters("fonts", font.id);
    return { ...font, downloadCount: font.downloadCount + Number(counters.downloads ?? 0) };
  }));
  return fonts.filter((font) => matchesKeyword(font, keyword)).sort(sortFonts);
}

async function captureWarning(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    return "字体操作已完成，但日志或上传记录写入失败。";
  }
  return undefined;
}

export const fontService = {
  async getFonts(keyword?: string): Promise<FontAsset[]> {
    return getFontsWithReader(readJsonFileReadonly, keyword);
  },

  async getFontsForKnowledge(keyword?: string): Promise<FontAsset[]> {
    return getFontsWithReader(readJsonFileReadonly, keyword);
  },

  async countFonts() {
    return (await readJsonFileReadonly<FontAsset[]>(FONTS_FILE, [])).length;
  },

  async getFontById(id: string) {
    const fonts = await readJsonFileReadonly<FontAsset[]>(FONTS_FILE, []);
    const font = fonts.find((item) => item.id === id);
    if (!font) return null;
    const counters = await operationalStateService.downloadCounters("fonts", font.id);
    return { ...font, downloadCount: font.downloadCount + Number(counters.downloads ?? 0) };
  },

  async getFontVersions(fontId: string) {
    const versions = await readJsonFileReadonly<FontVersion[]>(FONT_VERSIONS_FILE, []);
    return Promise.all(versions.filter((version) => version.fontId === fontId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).map(async (version) => {
      const counters = await operationalStateService.downloadCounters("fontVersions", version.id);
      return { ...version, downloadCount: version.downloadCount + Number(counters.downloads ?? 0) };
    }));
  },

  async getFontVersionsForKnowledge(fontId: string) {
    const versions = await readJsonFileReadonly<FontVersion[]>(FONT_VERSIONS_FILE, []);
    return versions.filter((version) => version.fontId === fontId).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  },

  async createFont(input: FontInput, filePath: string, file: File, operator = "admin"): Promise<MutationResult<FontAsset>> {
    const fonts = await readJsonFileForMutation<FontAsset[]>(FONTS_FILE, []);
    const versions = await readJsonFileForMutation<FontVersion[]>(FONT_VERSIONS_FILE, []);
    const now = new Date().toISOString();
    const font: FontAsset = {
      id: createId(input.name),
      ...input,
      filePath,
      fileName: file.name,
      fileSize: file.size,
      fileFormat: getFontFormat(file.name),
      downloadCount: 0,
      createdAt: now,
      updatedAt: now
    };
    const version: FontVersion = {
      id: `font-version-${Date.now()}`,
      fontId: font.id,
      version: font.version,
      filePath,
      fileName: file.name,
      fileSize: file.size,
      fileFormat: font.fileFormat,
      operator,
      createdAt: now,
      downloadCount: 0
    };
    await writeJsonFile(FONTS_FILE, [font, ...fonts]);
    await writeJsonFile(FONT_VERSIONS_FILE, [version, ...versions]);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "upload",
        title: `上传字体：${font.name}`,
        description: `上传 Font Library 资产「${font.name}」${font.version}`,
        targetType: "asset",
        targetId: font.id,
        targetName: font.name,
        operator,
        diffSummary: [`上传版本 ${font.version}`, `文件名：${file.name}`, `文件大小：${file.size} bytes`]
      });
      await uploadRecordService.createUpload({
        fileName: file.name,
        fileType: "other",
        assetModule: "font",
        relatedAssetId: font.id,
        relatedAssetName: font.name,
        operator,
        status: "success",
        summary: `上传字体文件 ${font.version}`,
        storagePath: filePath
      });
    });
    return { data: font, warning };
  },

  async updateFont(id: string, input: FontInput, operator = "admin"): Promise<MutationResult<FontAsset> | null> {
    const fonts = await readJsonFileForMutation<FontAsset[]>(FONTS_FILE, []);
    const index = fonts.findIndex((font) => font.id === id);
    if (index < 0) return null;
    const font = { ...fonts[index], ...input, version: fonts[index].version, updatedAt: new Date().toISOString() };
    fonts[index] = font;
    await writeJsonFile(FONTS_FILE, fonts);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "update",
        title: `编辑字体：${font.name}`,
        description: `编辑 Font Library 资产「${font.name}」`,
        targetType: "asset",
        targetId: font.id,
        targetName: font.name,
        operator,
        diffSummary: ["字体元数据已更新"]
      });
    });
    return { data: font, warning };
  },

  async addVersion(fontId: string, versionName: string, filePath: string, file: File, operator = "admin") {
    const fonts = await readJsonFileForMutation<FontAsset[]>(FONTS_FILE, []);
    const versions = await readJsonFileForMutation<FontVersion[]>(FONT_VERSIONS_FILE, []);
    const index = fonts.findIndex((font) => font.id === fontId);
    if (index < 0) return null;
    const now = new Date().toISOString();
    const font = {
      ...fonts[index],
      version: versionName,
      filePath,
      fileName: file.name,
      fileSize: file.size,
      fileFormat: getFontFormat(file.name),
      updatedAt: now
    };
    const version: FontVersion = {
      id: `font-version-${Date.now()}`,
      fontId,
      version: versionName,
      filePath,
      fileName: file.name,
      fileSize: file.size,
      fileFormat: font.fileFormat,
      operator,
      createdAt: now,
      downloadCount: 0
    };
    fonts[index] = font;
    await writeJsonFile(FONTS_FILE, fonts);
    await writeJsonFile(FONT_VERSIONS_FILE, [version, ...versions]);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "version",
        title: `更新字体版本：${font.name} ${versionName}`,
        description: `上传字体新版本 ${versionName}`,
        targetType: "version",
        targetId: version.id,
        targetName: font.name,
        operator,
        diffSummary: [`文件名：${file.name}`, `文件大小：${file.size} bytes`]
      });
      await uploadRecordService.createUpload({
        fileName: file.name,
        fileType: "other",
        assetModule: "font",
        relatedAssetId: font.id,
        relatedAssetName: font.name,
        operator,
        status: "success",
        summary: `上传字体新版本 ${versionName}`,
        storagePath: filePath
      });
    });
    return { data: version, warning };
  },

  async incrementDownload(fontId: string, versionId?: string) {
    await operationalStateService.recordDownload("fonts", fontId);
    if (versionId) await operationalStateService.recordDownload("fontVersions", versionId);
  },

  async deleteFont(id: string, operator = "admin"): Promise<DeleteResult> {
    const fonts = await readJsonFileForMutation<FontAsset[]>(FONTS_FILE, []);
    const versions = await readJsonFileForMutation<FontVersion[]>(FONT_VERSIONS_FILE, []);
    const font = fonts.find((item) => item.id === id);
    const fontVersions = versions.filter((version) => version.fontId === id);
    const nextFonts = fonts.filter((item) => item.id !== id);
    if (nextFonts.length === fonts.length) return { deleted: false };
    await writeJsonFile(FONTS_FILE, nextFonts);
    await writeJsonFile(FONT_VERSIONS_FILE, versions.filter((version) => version.fontId !== id));
    const warning = await captureWarning(async () => {
      await removeStoredAssetFoldersFromPaths(
        storageFolders.font,
        [font?.filePath, ...fontVersions.map((version) => version.filePath)],
        font?.name
      );
      await operationLogService.createLog({
        type: "delete",
        title: `删除字体：${font?.name ?? id}`,
        description: `删除 Font Library 资产「${font?.name ?? id}」`,
        targetType: "asset",
        targetId: id,
        targetName: font?.name,
        operator,
        diffSummary: ["删除字体"]
      });
    });
    return { deleted: true, warning };
  },

  async readFile(filePath: string) {
    return fs.readFile(resolveDataPath(filePath));
  }
};
