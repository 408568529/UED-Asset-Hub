export const tagTypes = [
  "skill-usage",
  "skill-tag",
  "prompt-usage",
  "prompt-tag",
  "font-tag",
  "training-tag",
  "test-environment-tag",
  "product-tag",
  "component-tag",
  "sop-tag"
] as const;

export type TagType = (typeof tagTypes)[number];

export interface AssetTagOption {
  id: string;
  type: TagType;
  name: string;
  usageCount: number;
  createdAt: string;
}

export type UsageScenarioTag = AssetTagOption;
