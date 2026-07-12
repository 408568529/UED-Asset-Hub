import { readJsonFile, writeJsonFile } from "@/lib/storage/jsonStorage";
import { normalizeTagName } from "@/lib/tagUtils";
import type { AssetTagOption, TagType } from "@/types/tag";

const FILE_NAME = "tags.json";
let mutationQueue: Promise<unknown> = Promise.resolve();

function mutateTags<T>(action: () => Promise<T>) {
  const result = mutationQueue.then(action, action);
  mutationQueue = result.then(() => undefined, () => undefined);
  return result;
}

function uniqueNames(names: string[]) {
  const values = new Map<string, string>();
  names.forEach((name) => {
    const displayName = name.trim().replace(/\s+/g, " ");
    const key = normalizeTagName(displayName);
    if (key && !values.has(key)) values.set(key, displayName);
  });
  return [...values.values()];
}

export const tagService = {
  async getTagsByType(type: TagType) {
    const tags = await readJsonFile<AssetTagOption[]>(FILE_NAME, []);
    return tags.filter((tag) => tag.type === type).sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));
  },

  async createTag(type: TagType, name: string) {
    return mutateTags(async () => {
      const tags = await readJsonFile<AssetTagOption[]>(FILE_NAME, []);
      const normalized = normalizeTagName(name);
      const existing = tags.find((tag) => tag.type === type && normalizeTagName(tag.name) === normalized);
      if (existing) return existing;
      const tag: AssetTagOption = {
        id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type,
        name: name.trim().replace(/\s+/g, " "),
        usageCount: 0,
        createdAt: new Date().toISOString()
      };
      await writeJsonFile(FILE_NAME, [tag, ...tags]);
      return tag;
    });
  },

  async syncTagsByType(type: TagType, usedNames: string[]) {
    return mutateTags(async () => {
      const tags = await readJsonFile<AssetTagOption[]>(FILE_NAME, []);
      const names = uniqueNames(usedNames);
      const usageCounts = new Map<string, number>();
      usedNames.forEach((name) => {
        const key = normalizeTagName(name);
        if (key) usageCounts.set(key, (usageCounts.get(key) ?? 0) + 1);
      });
      const otherTags = tags.filter((tag) => tag.type !== type);
      const existing = new Map(tags.filter((tag) => tag.type === type).map((tag) => [normalizeTagName(tag.name), tag]));
      const nextTags = names.map<AssetTagOption>((name) => {
        const current = existing.get(normalizeTagName(name));
        return current
          ? { ...current, name, usageCount: usageCounts.get(normalizeTagName(name)) ?? 0 }
          : { id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, name, usageCount: usageCounts.get(normalizeTagName(name)) ?? 0, createdAt: new Date().toISOString() };
      });
      const unused = [...existing.values()].filter((tag) => !usageCounts.has(normalizeTagName(tag.name))).map((tag) => ({ ...tag, usageCount: 0 }));
      await writeJsonFile(FILE_NAME, [...nextTags, ...unused, ...otherTags]);
      return nextTags;
    });
  },

  async mergeTags(type: TagType, sourceNames: string[], targetName: string) {
    return mutateTags(async () => {
      const sourceKeys = new Set(sourceNames.map(normalizeTagName));
      const tags = await readJsonFile<AssetTagOption[]>(FILE_NAME, []);
      const next = tags.filter((tag) => tag.type !== type || !sourceKeys.has(normalizeTagName(tag.name)));
      const normalizedTarget = normalizeTagName(targetName);
      const existing = next.find((tag) => tag.type === type && normalizeTagName(tag.name) === normalizedTarget);
      if (existing) { await writeJsonFile(FILE_NAME, next); return existing; }
      const tag: AssetTagOption = { id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, type, name: targetName.trim().replace(/\s+/g, " "), usageCount: 0, createdAt: new Date().toISOString() };
      await writeJsonFile(FILE_NAME, [tag, ...next]);
      return tag;
    });
  },

  async updateTag(id: string, name: string) {
    return mutateTags(async () => {
      const tags = await readJsonFile<AssetTagOption[]>(FILE_NAME, []);
      const index = tags.findIndex((tag) => tag.id === id);
      if (index < 0) return null;
      const normalized = normalizeTagName(name);
      const duplicate = tags.find((tag) => tag.id !== id && tag.type === tags[index].type && normalizeTagName(tag.name) === normalized);
      if (duplicate) return duplicate;
      tags[index] = { ...tags[index], name: name.trim().replace(/\s+/g, " ") };
      await writeJsonFile(FILE_NAME, tags);
      return tags[index];
    });
  },

  async deleteTag(id: string) {
    return mutateTags(async () => {
      const tags = await readJsonFile<AssetTagOption[]>(FILE_NAME, []);
      const next = tags.filter((tag) => tag.id !== id);
      if (next.length === tags.length) return false;
      await writeJsonFile(FILE_NAME, next);
      return true;
    });
  }
};
