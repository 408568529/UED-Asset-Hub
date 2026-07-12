export type SearchAssetType = "product" | "component" | "sop" | "skill" | "font" | "prompt" | "training" | "test-environment";

export interface SearchResult {
  id: string;
  type: SearchAssetType;
  typeLabel: string;
  title: string;
  excerpt: string;
  tags: string[];
  author?: string;
  updatedAt: string;
  url: string;
  score: number;
}

export interface SearchParams {
  keyword?: string;
  types?: SearchAssetType[];
  tags?: string[];
}
