import type { User } from "./user";

export type AssetCategory =
  | "vibe-product"
  | "sop"
  | "knowledge"
  | "component-guideline"
  | "project-retrospective"
  | "prompt-library";

export interface AssetTag {
  id: string;
  name: string;
}

export interface Comment {
  id: string;
  assetId: string;
  author: User;
  content: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: AssetCategory;
  coverUrl: string;
  author: User;
  tags: AssetTag[];
  topicIds: string[];
  content: string;
  aiSummary: string;
  publishedAt: string;
  updatedAt: string;
  readTime: number;
  views: number;
  likes: number;
  saves: number;
  commentsCount: number;
  featured?: boolean;
}

export interface AssetQuery {
  category?: AssetCategory;
  keyword?: string;
  tags?: string[];
  sort?: "latest" | "popular" | "saved";
  limit?: number;
}
