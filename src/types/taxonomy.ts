import type { TagType } from "@/types/tag";

export const taxonomyTypes = [
  "skill-usage",
  "skill-tag",
  "prompt-usage",
  "prompt-tag",
  "font-tag",
  "training-tag",
  "test-environment-tag",
  "product-tag",
  "component-tag",
  "sop-tag",
  "prompt-category",
  "skill-category",
  "training-folder"
] as const;

export type TaxonomyType = (typeof taxonomyTypes)[number];
export type ManagedTagType = Exclude<TaxonomyType, "prompt-category" | "skill-category" | "training-folder">;

export interface TaxonomyItem {
  id: string;
  type: TaxonomyType;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
  usageCount: number;
}

export type TaxonomyDeleteRequest =
  | { mode: "remove" }
  | { mode: "replace"; replacementId: string }
  | { mode: "move"; targetFolderId: string }
  | { mode: "uncategorize" }
  | { mode: "delete-videos" };

export function isManagedTagType(type: TaxonomyType): type is TagType {
  return !["prompt-category", "skill-category", "training-folder"].includes(type);
}
