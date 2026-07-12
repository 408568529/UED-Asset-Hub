import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import { storageFolders } from "@/config/storage";
import { diffComponent } from "@/lib/auditDiff";
import { removeStoredModuleEntry } from "@/lib/storage/deleteStoredEntry";
import { assetVersionService } from "@/services/assetVersionService";
import { operationLogService } from "@/services/operationLogService";
import type { MutationResult, DeleteResult } from "@/types/serviceResult";
import type { ComponentSpec, ComponentSpecInput } from "@/types/componentSpec";

const FILE_NAME = "components.json";

function createId(name: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}`;
}

function matchesKeyword(component: ComponentSpec, keyword?: string) {
  if (!keyword) return true;
  const value = `${component.name} ${component.description} ${component.docLink} ${component.figmaLink ?? ""} ${(component.tags ?? []).join(" ")}`.toLowerCase();
  return value.includes(keyword.toLowerCase());
}

function sortComponents(a: ComponentSpec, b: ComponentSpec) {
  return (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || +new Date(b.updatedAt) - +new Date(a.updatedAt);
}

async function captureWarning(action: () => Promise<void>) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    return "资产操作已完成，但日志或版本记录写入失败。";
  }
  return undefined;
}

export const componentSpecService = {
  async getComponents(keyword?: string): Promise<ComponentSpec[]> {
    const components = await readJsonFile<ComponentSpec[]>(FILE_NAME, []);
    return components
      .filter((component) => matchesKeyword(component, keyword))
      .sort(sortComponents);
  },

  async countComponents(): Promise<number> {
    return (await readJsonFile<ComponentSpec[]>(FILE_NAME, [])).length;
  },

  async createComponent(input: ComponentSpecInput, operator = "admin"): Promise<MutationResult<ComponentSpec>> {
    const components = await readJsonFile<ComponentSpec[]>(FILE_NAME, []);
    const now = new Date().toISOString();
    const component: ComponentSpec = {
      id: createId(input.name),
      name: input.name,
      description: input.description,
      docLink: input.docLink,
      figmaLink: input.figmaLink,
      tags: input.tags,
      sortOrder: input.sortOrder,
      createdAt: now,
      updatedAt: now
    };
    await writeJsonFile(FILE_NAME, [component, ...components]);
    const warning = await captureWarning(async () => {
      await operationLogService.createLog({
        type: "create",
        title: `新增资产：${component.name}`,
        description: `新增组件规范「${component.name}」`,
        targetType: "asset",
        targetId: component.id,
        targetName: component.name,
        operator,
        diffSummary: ["创建资产"]
      });
    });
    return { data: component, warning };
  },

  async updateComponent(id: string, input: ComponentSpecInput, operator = "admin"): Promise<MutationResult<ComponentSpec> | null> {
    const components = await readJsonFile<ComponentSpec[]>(FILE_NAME, []);
    const index = components.findIndex((component) => component.id === id);
    if (index < 0) return null;

    const before = components[index];
    const diffSummary = diffComponent(before, input);
    const component = { ...components[index], ...input, updatedAt: new Date().toISOString() };
    components[index] = component;
    await writeJsonFile(FILE_NAME, components);
    const warning = await captureWarning(async () => {
      if (diffSummary.length) {
        const version = await assetVersionService.createVersion({
          assetType: "component",
          assetId: component.id,
          title: component.name,
          contentSnapshot: JSON.stringify(component, null, 2),
          changeSummary: diffSummary,
          operator
        });
        await operationLogService.createLog({
          type: "version",
          title: `更新版本：${component.name} ${version.version}`,
          description: `生成组件规范版本 ${version.version}`,
          targetType: "version",
          targetId: version.id,
          targetName: component.name,
          operator,
          diffSummary
        });
      }
      await operationLogService.createLog({
        type: "update",
        title: `编辑资产：${component.name}`,
        description: `编辑组件规范「${component.name}」`,
        targetType: "asset",
        targetId: component.id,
        targetName: component.name,
        operator,
        diffSummary: diffSummary.length ? diffSummary : ["未检测到字段变化"]
      });
    });
    return { data: component, warning };
  },

  async deleteComponent(id: string, operator = "admin"): Promise<DeleteResult> {
    const components = await readJsonFile<ComponentSpec[]>(FILE_NAME, []);
    const component = components.find((item) => item.id === id);
    const nextComponents = components.filter((component) => component.id !== id);
    if (nextComponents.length === components.length) return { deleted: false };
    await writeJsonFile(FILE_NAME, nextComponents);
    const warning = await captureWarning(async () => {
      await removeStoredModuleEntry(storageFolders.component, component?.name);
      await operationLogService.createLog({
        type: "delete",
        title: `删除资产：${component?.name ?? id}`,
        description: `删除组件规范「${component?.name ?? id}」`,
        targetType: "asset",
        targetId: id,
        targetName: component?.name,
        operator,
        diffSummary: ["删除资产"]
      });
    });
    return { deleted: true, warning };
  },

  async getComponentById(id: string): Promise<ComponentSpec | null> {
    const components = await readJsonFile<ComponentSpec[]>(FILE_NAME, []);
    return components.find((component) => component.id === id) ?? null;
  }
};
