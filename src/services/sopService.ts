import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import { operationLogService } from "@/services/operationLogService";
import type { DeleteResult, MutationResult } from "@/types/serviceResult";
import type { Sop, SopInput } from "@/types/sop";

const FILE_NAME = "sops.json";

function createId(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
}

function matchesKeyword(sop: Sop, keyword?: string) {
  if (!keyword) return true;
  const value = `${sop.name} ${sop.description} ${sop.docLink} ${sop.owner ?? ""} ${(sop.tags ?? []).join(" ")}`.toLowerCase();
  return value.includes(keyword.toLowerCase());
}

function sortSops(a: Sop, b: Sop) {
  return (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

async function captureWarning(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    return "SOP 操作已完成，但日志记录写入失败。";
  }
  return undefined;
}

export const sopService = {
  async getSops(keyword?: string): Promise<Sop[]> {
    const sops = await readJsonFile<Sop[]>(FILE_NAME, []);
    return sops.filter((sop) => matchesKeyword(sop, keyword)).sort(sortSops);
  },

  async countSops(): Promise<number> {
    return (await readJsonFile<Sop[]>(FILE_NAME, [])).length;
  },

  async getSopById(id: string): Promise<Sop | null> {
    const sops = await readJsonFile<Sop[]>(FILE_NAME, []);
    return sops.find((sop) => sop.id === id) ?? null;
  },

  async createSop(input: SopInput, operator = "admin"): Promise<MutationResult<Sop>> {
    const sops = await readJsonFile<Sop[]>(FILE_NAME, []);
    const now = new Date().toISOString();
    const sop: Sop = {
      id: createId(input.name),
      name: input.name,
      description: input.description,
      docLink: input.docLink,
      owner: input.owner,
      tags: input.tags,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now
    };
    await writeJsonFile(FILE_NAME, [sop, ...sops]);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "create",
        title: `新增 SOP：${sop.name}`,
        description: `新增标准 SOP「${sop.name}」`,
        targetType: "asset",
        targetId: sop.id,
        targetName: sop.name,
        operator,
        diffSummary: ["创建 SOP"]
      });
    });
    return { data: sop, warning };
  },

  async updateSop(id: string, input: SopInput, operator = "admin"): Promise<MutationResult<Sop> | null> {
    const sops = await readJsonFile<Sop[]>(FILE_NAME, []);
    const index = sops.findIndex((sop) => sop.id === id);
    if (index < 0) return null;

    const sop = { ...sops[index], ...input, updatedAt: new Date().toISOString() };
    sops[index] = sop;
    await writeJsonFile(FILE_NAME, sops);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "update",
        title: `编辑 SOP：${sop.name}`,
        description: `编辑标准 SOP「${sop.name}」`,
        targetType: "asset",
        targetId: sop.id,
        targetName: sop.name,
        operator,
        diffSummary: ["SOP 内容已更新"]
      });
    });
    return { data: sop, warning };
  },

  async deleteSop(id: string, operator = "admin"): Promise<DeleteResult> {
    const sops = await readJsonFile<Sop[]>(FILE_NAME, []);
    const sop = sops.find((item) => item.id === id);
    const nextSops = sops.filter((item) => item.id !== id);
    if (nextSops.length === sops.length) return { deleted: false };
    await writeJsonFile(FILE_NAME, nextSops);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "delete",
        title: `删除 SOP：${sop?.name ?? id}`,
        description: `删除标准 SOP「${sop?.name ?? id}」`,
        targetType: "asset",
        targetId: id,
        targetName: sop?.name,
        operator,
        diffSummary: ["删除 SOP"]
      });
    });
    return { deleted: true, warning };
  }
};
