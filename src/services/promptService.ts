import { readJsonFileForMutation, readJsonFileReadonly, writeJsonFile } from "@/lib/storage/jsonStorage";
import { storageFolders } from "@/config/storage";
import { removeStoredModuleEntry } from "@/lib/storage/deleteStoredEntry";
import { operationLogService } from "@/services/operationLogService";
import { operationalStateService } from "@/services/operationalStateService";
import type { DeleteResult, MutationResult } from "@/types/serviceResult";
import type { PromptAsset, PromptInput } from "@/types/prompt";

const FILE_NAME = "prompts.json";

function createId(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
}

function matchesPrompt(prompt: PromptAsset, keyword?: string) {
  if (!keyword) return true;
  const value = `${prompt.name} ${prompt.summary} ${prompt.category} ${prompt.tags.join(" ")} ${prompt.models.join(" ")} ${prompt.scenarios.join(" ")} ${prompt.content}`.toLowerCase();
  return value.includes(keyword.toLowerCase());
}

function sortPrompts(a: PromptAsset, b: PromptAsset) {
  return b.copyCount - a.copyCount || b.viewCount - a.viewCount || +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

async function getPromptsWithReader(reader: typeof readJsonFileForMutation, keyword?: string) {
  const prompts = await Promise.all((await reader<PromptAsset[]>(FILE_NAME, [])).map(async (prompt) => {
    const counters = await operationalStateService.promptCounters(prompt.id);
    return { ...prompt, viewCount: prompt.viewCount + Number(counters.views ?? 0), copyCount: prompt.copyCount + Number(counters.copies ?? 0) };
  }));
  return prompts.filter((prompt) => matchesPrompt(prompt, keyword)).sort(sortPrompts);
}

async function captureWarning(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    return "Prompt 操作已完成，但日志记录写入失败。";
  }
  return undefined;
}

export const promptService = {
  async getPrompts(keyword?: string): Promise<PromptAsset[]> {
    return getPromptsWithReader(readJsonFileReadonly, keyword);
  },

  async getPromptsForKnowledge(keyword?: string): Promise<PromptAsset[]> {
    return getPromptsWithReader(readJsonFileReadonly, keyword);
  },

  async countPrompts() {
    return (await readJsonFileReadonly<PromptAsset[]>(FILE_NAME, [])).length;
  },

  async getPromptById(id: string) {
    const prompts = await readJsonFileReadonly<PromptAsset[]>(FILE_NAME, []);
    const prompt = prompts.find((item) => item.id === id);
    if (!prompt) return null;
    const counters = await operationalStateService.promptCounters(prompt.id);
    return { ...prompt, viewCount: prompt.viewCount + Number(counters.views ?? 0), copyCount: prompt.copyCount + Number(counters.copies ?? 0) };
  },

  async getPromptForKnowledgeById(id: string) {
    const prompts = await readJsonFileReadonly<PromptAsset[]>(FILE_NAME, []);
    return prompts.find((prompt) => prompt.id === id) ?? null;
  },

  async createPrompt(input: PromptInput, operator = "admin"): Promise<MutationResult<PromptAsset>> {
    const prompts = await readJsonFileForMutation<PromptAsset[]>(FILE_NAME, []);
    const now = new Date().toISOString();
    const prompt: PromptAsset = {
      id: createId(input.name),
      ...input,
      viewCount: 0,
      copyCount: 0,
      createdAt: now,
      updatedAt: now
    };
    await writeJsonFile(FILE_NAME, [prompt, ...prompts]);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "create",
        title: `新增 Prompt：${prompt.name}`,
        description: `新增 Prompt Library 资产「${prompt.name}」`,
        targetType: "asset",
        targetId: prompt.id,
        targetName: prompt.name,
        operator,
        diffSummary: ["创建 Prompt"]
      });
    });
    return { data: prompt, warning };
  },

  async updatePrompt(id: string, input: PromptInput, operator = "admin"): Promise<MutationResult<PromptAsset> | null> {
    const prompts = await readJsonFileForMutation<PromptAsset[]>(FILE_NAME, []);
    const index = prompts.findIndex((prompt) => prompt.id === id);
    if (index < 0) return null;
    const prompt = { ...prompts[index], ...input, updatedAt: new Date().toISOString() };
    prompts[index] = prompt;
    await writeJsonFile(FILE_NAME, prompts);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "update",
        title: `编辑 Prompt：${prompt.name}`,
        description: `编辑 Prompt Library 资产「${prompt.name}」`,
        targetType: "asset",
        targetId: prompt.id,
        targetName: prompt.name,
        operator,
        diffSummary: ["Prompt 元数据已更新"]
      });
    });
    return { data: prompt, warning };
  },

  async incrementView(id: string) {
    const prompt = await this.getPromptById(id);
    if (!prompt) return null;
    await operationalStateService.recordPrompt(id, "views");
    return { ...prompt, viewCount: prompt.viewCount + 1 };
  },

  async incrementCopy(id: string, operator = "visitor") {
    const prompt = await this.getPromptById(id);
    if (!prompt) return null;
    await operationalStateService.recordPrompt(id, "copies");
    await captureWarning(() => operationLogService.createLog({
      type: "copy",
      title: `复制 Prompt：${prompt.name}`,
      description: "从 Prompt 列表或详情复制完整内容",
      targetType: "asset",
      targetId: id,
      targetName: prompt.name,
      operator
    }).then(() => undefined));
    return { ...prompt, copyCount: prompt.copyCount + 1 };
  },

  async deletePrompt(id: string, operator = "admin"): Promise<DeleteResult> {
    const prompts = await readJsonFileForMutation<PromptAsset[]>(FILE_NAME, []);
    const prompt = prompts.find((item) => item.id === id);
    const nextPrompts = prompts.filter((item) => item.id !== id);
    if (nextPrompts.length === prompts.length) return { deleted: false };
    await writeJsonFile(FILE_NAME, nextPrompts);
    const warning = await captureWarning(async () => {
      await removeStoredModuleEntry(storageFolders.prompt, prompt?.name);
      await operationLogService.createLog({
        type: "delete",
        title: `删除 Prompt：${prompt?.name ?? id}`,
        description: `删除 Prompt Library 资产「${prompt?.name ?? id}」`,
        targetType: "asset",
        targetId: id,
        targetName: prompt?.name,
        operator,
        diffSummary: ["删除 Prompt"]
      });
    });
    return { deleted: true, warning };
  }
};
