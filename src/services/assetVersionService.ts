import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import type { AssetVersion, AssetVersionType } from "@/types/audit";

const FILE_NAME = "versions.json";

type VersionInput = Omit<AssetVersion, "id" | "version" | "createdAt"> & { createdAt?: string };

function nextVersion(versions: AssetVersion[], assetId: string, assetType: AssetVersionType) {
  const count = versions.filter((version) => version.assetId === assetId && version.assetType === assetType).length;
  return `v1.0.${count}`;
}

export const assetVersionService = {
  async getVersions(assetType?: AssetVersionType, assetId?: string): Promise<AssetVersion[]> {
    const versions = await readJsonFile<AssetVersion[]>(FILE_NAME, []);
    return versions
      .filter((version) => (assetType ? version.assetType === assetType : true))
      .filter((version) => (assetId ? version.assetId === assetId : true))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  },

  async getVersionById(id: string): Promise<AssetVersion | null> {
    const versions = await readJsonFile<AssetVersion[]>(FILE_NAME, []);
    return versions.find((version) => version.id === id) ?? null;
  },

  async createVersion(input: VersionInput): Promise<AssetVersion> {
    const versions = await readJsonFile<AssetVersion[]>(FILE_NAME, []);
    const version: AssetVersion = {
      id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      version: nextVersion(versions, input.assetId, input.assetType),
      createdAt: input.createdAt ?? new Date().toISOString(),
      ...input
    };
    await writeJsonFile(FILE_NAME, [version, ...versions]);
    return version;
  }
};
