import { promises as fs } from "node:fs";
import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import { normalizeTagName } from "@/lib/tagUtils";
import { normalizeTrainingName } from "@/lib/trainingUtils";
import { removeLinkedServerFile, removeTrainingVideoFiles, resolveTrainingCoverPath } from "@/lib/trainingStorage";
import { operationLogService } from "@/services/operationLogService";
import type { AssetTagOption, TagType } from "@/types/tag";
import type { TaxonomyDeleteRequest, TaxonomyItem, TaxonomyType } from "@/types/taxonomy";

const FILE_NAME = "taxonomy.json";
const LEGACY_TAGS_FILE = "tags.json";
const GROUPS_FILE = "training-groups.json";
const VIDEOS_FILE = "training-videos.json";

type ReferenceSource = { file: string; valueKey: string; idKey: string; multiple: boolean };

const references: Record<Exclude<TaxonomyType, "training-folder">, ReferenceSource> = {
  "product-tag": { file: "products.json", valueKey: "tags", idKey: "tagIds", multiple: true },
  "component-tag": { file: "components.json", valueKey: "tags", idKey: "tagIds", multiple: true },
  "sop-tag": { file: "sops.json", valueKey: "tags", idKey: "tagIds", multiple: true },
  "skill-tag": { file: "skills.json", valueKey: "tags", idKey: "tagIds", multiple: true },
  "skill-usage": { file: "skills.json", valueKey: "usageScenarios", idKey: "usageScenarioIds", multiple: true },
  "font-tag": { file: "fonts.json", valueKey: "tags", idKey: "tagIds", multiple: true },
  "prompt-tag": { file: "prompts.json", valueKey: "tags", idKey: "tagIds", multiple: true },
  "prompt-usage": { file: "prompts.json", valueKey: "scenarios", idKey: "scenarioIds", multiple: true },
  "training-tag": { file: VIDEOS_FILE, valueKey: "tags", idKey: "tagIds", multiple: true },
  "test-environment-tag": { file: "test-environments.json", valueKey: "tags", idKey: "tagIds", multiple: true },
  "prompt-category": { file: "prompts.json", valueKey: "category", idKey: "categoryId", multiple: false },
  "skill-category": { file: "skills.json", valueKey: "category", idKey: "categoryId", multiple: false }
};

type LooseRecord = Record<string, unknown>;

function normalName(name: string) {
  return normalizeTagName(name.trim().replace(/\s+/g, " "));
}

function createItem(type: TaxonomyType, name: string, id?: string): TaxonomyItem {
  const now = new Date().toISOString();
  const displayName = name.trim().replace(/\s+/g, " ");
  return { id: id ?? `taxonomy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, name: displayName, normalizedName: normalName(displayName), createdAt: now, updatedAt: now, usageCount: 0 };
}

async function readRecords(file: string) {
  return readJsonFile<LooseRecord[]>(file, []);
}

async function writeRecords(file: string, records: LooseRecord[]) {
  await writeJsonFile(file, records);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

async function writeLegacyTags(items: TaxonomyItem[]) {
  const tags = items.filter((item) => item.type.endsWith("tag") || item.type.endsWith("usage"))
    .map<AssetTagOption>((item) => ({ id: item.id, type: item.type as TagType, name: item.name, usageCount: item.usageCount, createdAt: item.createdAt }));
  await writeJsonFile(LEGACY_TAGS_FILE, tags);
}

async function log(type: "create" | "update" | "delete", title: string, description: string, targetId: string, targetName: string, diffSummary: string[]) {
  await operationLogService.createLog({ type, title, description, targetType: "system", targetId, targetName, operator: "admin", diffSummary }).catch((error) => console.error("Taxonomy log write failed", error));
}

async function migrateItems(items: TaxonomyItem[]) {
  const existing = new Map(items.map((item) => [`${item.type}:${item.normalizedName}`, item]));
  let changed = false;
  const ensure = (type: Exclude<TaxonomyType, "training-folder">, name: string) => {
    const key = `${type}:${normalName(name)}`;
    let item = existing.get(key);
    if (!item) {
      item = createItem(type, name);
      items.push(item);
      existing.set(key, item);
      changed = true;
    }
    return item;
  };

  ["Codex", "Claude", "Cursor", "Prompt", "Workflow", "MCP", "Other"].forEach((name) => ensure("skill-category", name));
  ["设计研发", "通用 Prompt"].forEach((name) => ensure("prompt-category", name));

  for (const [type, source] of Object.entries(references) as [Exclude<TaxonomyType, "training-folder">, ReferenceSource][]) {
    const records = await readRecords(source.file);
    let recordsChanged = false;
    for (const record of records) {
      const values = source.multiple ? stringArray(record[source.valueKey]) : [String(record[source.valueKey] ?? "")].filter(Boolean);
      const ids = values.map((value) => ensure(type, value).id);
      if (source.multiple) {
        if (JSON.stringify(record[source.idKey]) !== JSON.stringify(ids)) { record[source.idKey] = ids; recordsChanged = true; }
      } else if (record[source.idKey] !== ids[0]) {
        record[source.idKey] = ids[0] ?? "";
        recordsChanged = true;
      }
    }
    if (recordsChanged) await writeRecords(source.file, records);
  }
  return changed;
}

async function loadItems() {
  const items = await readJsonFile<TaxonomyItem[]>(FILE_NAME, []);
  const legacy = await readJsonFile<AssetTagOption[]>(LEGACY_TAGS_FILE, []);
  let importedLegacy = false;
  legacy.forEach((tag) => {
    if (items.some((item) => item.type === tag.type && item.normalizedName === normalName(tag.name))) return;
    items.push({ ...createItem(tag.type, tag.name, tag.id), createdAt: tag.createdAt, updatedAt: tag.createdAt, usageCount: tag.usageCount });
    importedLegacy = true;
  });
  const migrated = await migrateItems(items);
  if (migrated || importedLegacy || !(await readJsonFile<TaxonomyItem[]>(FILE_NAME, [])).length) await writeJsonFile(FILE_NAME, items);
  return items;
}

async function referencesFor(type: Exclude<TaxonomyType, "training-folder">, item: TaxonomyItem) {
  const source = references[type];
  const records = await readRecords(source.file);
  return records.filter((record) => {
    if (source.multiple) return stringArray(record[source.idKey]).includes(item.id) || stringArray(record[source.valueKey]).some((value) => normalName(value) === item.normalizedName);
    return record[source.idKey] === item.id || normalName(String(record[source.valueKey] ?? "")) === item.normalizedName;
  });
}

async function updateReferences(type: Exclude<TaxonomyType, "training-folder">, item: TaxonomyItem, next?: TaxonomyItem) {
  const source = references[type];
  const records = await readRecords(source.file);
  let count = 0;
  for (const record of records) {
    const matches = source.multiple
      ? stringArray(record[source.idKey]).includes(item.id) || stringArray(record[source.valueKey]).some((value) => normalName(value) === item.normalizedName)
      : record[source.idKey] === item.id || normalName(String(record[source.valueKey] ?? "")) === item.normalizedName;
    if (!matches) continue;
    count += 1;
    if (source.multiple) {
      const values = stringArray(record[source.valueKey]);
      const ids = stringArray(record[source.idKey]);
      record[source.valueKey] = next ? values.map((value) => normalName(value) === item.normalizedName ? next.name : value) : values.filter((value) => normalName(value) !== item.normalizedName);
      record[source.idKey] = next ? ids.map((id) => id === item.id ? next.id : id) : ids.filter((id) => id !== item.id);
    } else {
      record[source.valueKey] = next ? next.name : "";
      record[source.idKey] = next ? next.id : "";
    }
    if (typeof record.updatedAt === "string") record.updatedAt = new Date().toISOString();
  }
  if (count) await writeRecords(source.file, records);
  return count;
}

export const taxonomyService = {
  async getItems(type: TaxonomyType, keyword?: string) {
    if (type === "training-folder") {
      const [groups, videos] = await Promise.all([readRecords(GROUPS_FILE), readRecords(VIDEOS_FILE)]);
      for (const video of videos) {
        if (!groups.some((group) => group.id === video.groupId)) {
          groups.push({ id: video.groupId, name: video.groupName || "未分类资料", normalizedName: normalizeTrainingName(String(video.groupName || "未分类资料")), createdAt: video.createdAt, updatedAt: video.updatedAt });
        }
      }
      const query = keyword?.trim().toLocaleLowerCase();
      return groups.map((group) => ({ id: String(group.id), type, name: String(group.name), normalizedName: String(group.normalizedName ?? normalizeTrainingName(String(group.name))), createdAt: String(group.createdAt), updatedAt: String(group.updatedAt ?? group.createdAt), usageCount: videos.filter((video) => video.groupId === group.id).length }))
        .filter((item) => !query || item.name.toLocaleLowerCase().includes(query))
        .sort((a, b) => b.usageCount - a.usageCount || b.updatedAt.localeCompare(a.updatedAt));
    }
    const items = await loadItems();
    const query = keyword?.trim().toLocaleLowerCase();
    const result = [] as TaxonomyItem[];
    for (const item of items.filter((item) => item.type === type && (!query || item.name.toLocaleLowerCase().includes(query)))) {
      const usageCount = (await referencesFor(type, item)).length;
      result.push({ ...item, usageCount });
    }
    return result.sort((a, b) => b.usageCount - a.usageCount || b.updatedAt.localeCompare(a.updatedAt));
  },

  async createItem(type: TaxonomyType, name: string) {
    const displayName = name.trim().replace(/\s+/g, " ");
    if (!displayName) throw new Error("名称不能为空。");
    if (type === "training-folder") {
      const groups = await readRecords(GROUPS_FILE);
      const duplicate = groups.find((group) => normalizeTrainingName(String(group.name)) === normalizeTrainingName(displayName));
      if (duplicate) return { id: String(duplicate.id), type, name: String(duplicate.name), normalizedName: String(duplicate.normalizedName), createdAt: String(duplicate.createdAt), updatedAt: String(duplicate.updatedAt ?? duplicate.createdAt), usageCount: 0 };
      const item = createItem(type, displayName, `group-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
      await writeRecords(GROUPS_FILE, [{ id: item.id, name: item.name, normalizedName: normalizeTrainingName(item.name), createdAt: item.createdAt, updatedAt: item.updatedAt }, ...groups]);
      await log("create", `新建培训资料文件夹：${item.name}`, "基础数据管理", item.id, item.name, ["新建文件夹"]);
      return item;
    }
    const items = await loadItems();
    const duplicate = items.find((item) => item.type === type && item.normalizedName === normalName(displayName));
    if (duplicate) return duplicate;
    const item = createItem(type, displayName);
    items.unshift(item);
    await writeJsonFile(FILE_NAME, items);
    await writeLegacyTags(items);
    await log("create", `新建基础数据：${item.name}`, type, item.id, item.name, ["新建选项"]);
    return item;
  },

  async renameItem(type: TaxonomyType, id: string, name: string) {
    const displayName = name.trim().replace(/\s+/g, " ");
    if (!displayName) throw new Error("名称不能为空。");
    if (type === "training-folder") {
      const [groups, videos] = await Promise.all([readRecords(GROUPS_FILE), readRecords(VIDEOS_FILE)]);
      const index = groups.findIndex((group) => group.id === id);
      if (index < 0) return null;
      if (groups.some((group) => group.id !== id && normalizeTrainingName(String(group.name)) === normalizeTrainingName(displayName))) throw new Error("已存在同名文件夹。");
      const before = String(groups[index].name);
      groups[index] = { ...groups[index], name: displayName, normalizedName: normalizeTrainingName(displayName), updatedAt: new Date().toISOString() };
      const affected = videos.filter((video) => video.groupId === id).length;
      videos.forEach((video) => { if (video.groupId === id) video.groupName = displayName; });
      await Promise.all([writeRecords(GROUPS_FILE, groups), writeRecords(VIDEOS_FILE, videos)]);
      await log("update", `重命名培训文件夹：${before} → ${displayName}`, "同步更新所属培训视频", id, displayName, [`影响视频：${affected}`]);
      return { ...groups[index], type, usageCount: affected } as TaxonomyItem;
    }
    const items = await loadItems();
    const index = items.findIndex((item) => item.type === type && item.id === id);
    if (index < 0) return null;
    if (items.some((item) => item.type === type && item.id !== id && item.normalizedName === normalName(displayName))) throw new Error("已存在同名选项，请使用合并功能。 ");
    const before = items[index];
    const next = { ...before, name: displayName, normalizedName: normalName(displayName), updatedAt: new Date().toISOString() };
    const affected = await updateReferences(type, before, next);
    items[index] = next;
    await writeJsonFile(FILE_NAME, items);
    await writeLegacyTags(items);
    await log("update", `重命名基础数据：${before.name} → ${next.name}`, type, id, next.name, [`影响资产：${affected}`]);
    return { ...next, usageCount: affected };
  },

  async deleteItem(type: TaxonomyType, id: string, request: TaxonomyDeleteRequest) {
    if (type === "training-folder") {
      const [groups, videos] = await Promise.all([readRecords(GROUPS_FILE), readRecords(VIDEOS_FILE)]);
      const group = groups.find((item) => item.id === id);
      if (!group) return { deleted: false, affected: 0 };
      const selected = videos.filter((video) => video.groupId === id);
      if (selected.length && request.mode === "move") {
        const target = groups.find((item) => item.id === request.targetFolderId);
        if (!target || target.id === id) throw new Error("请选择其他文件夹。");
        selected.forEach((video) => { video.groupId = target.id; video.groupName = target.name; video.updatedAt = new Date().toISOString(); });
      } else if (selected.length && request.mode === "uncategorize") {
        let target = groups.find((item) => normalizeTrainingName(String(item.name)) === normalizeTrainingName("未分类资料"));
        if (!target) { const now = new Date().toISOString(); target = { id: "ungrouped", name: "未分类资料", normalizedName: normalizeTrainingName("未分类资料"), createdAt: now, updatedAt: now }; groups.push(target); }
        selected.forEach((video) => { video.groupId = target.id; video.groupName = target.name; video.updatedAt = new Date().toISOString(); });
      } else if (selected.length && request.mode === "delete-videos") {
        for (const video of selected) {
          if (video.sourceMode === "server-local") {
            await removeLinkedServerFile(String(video.videoPath));
            if (video.coverPath) await fs.rm(resolveTrainingCoverPath(String(video.coverPath)), { force: true });
          }
          else await removeTrainingVideoFiles(String(video.videoPath), String(video.coverPath || "") || undefined);
        }
        const selectedIds = new Set(selected.map((video) => video.id));
        videos.splice(0, videos.length, ...videos.filter((video) => !selectedIds.has(video.id)));
      } else if (selected.length) {
        throw new Error("请先选择文件夹内视频的处理方式。");
      }
      await Promise.all([writeRecords(GROUPS_FILE, groups.filter((item) => item.id !== id)), writeRecords(VIDEOS_FILE, videos)]);
      await log("delete", `删除培训文件夹：${String(group.name)}`, "基础数据管理", id, String(group.name), [`影响视频：${selected.length}`, request.mode]);
      return { deleted: true, affected: selected.length };
    }
    const items = await loadItems();
    const item = items.find((entry) => entry.type === type && entry.id === id);
    if (!item) return { deleted: false, affected: 0 };
    let replacement: TaxonomyItem | undefined;
    if (request.mode === "replace") {
      replacement = items.find((entry) => entry.type === type && entry.id === request.replacementId);
      if (!replacement || replacement.id === id) throw new Error("请选择同类型的替换选项。");
    }
    const affected = await updateReferences(type, item, replacement);
    const next = items.filter((entry) => entry.id !== id);
    await writeJsonFile(FILE_NAME, next);
    await writeLegacyTags(next);
    await log("delete", `删除基础数据：${item.name}`, type, id, item.name, [`影响资产：${affected}`, replacement ? `替换为：${replacement.name}` : "移除引用"]);
    return { deleted: true, affected };
  }
};
