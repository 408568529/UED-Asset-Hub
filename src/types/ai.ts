export interface AIAnswer {
  id: string;
  question: string;
  answer: string;
  relatedAssetIds: string[];
  createdAt: string;
}

export interface SearchResult {
  id: string;
  type: "asset" | "topic" | "ai-answer";
  title: string;
  excerpt: string;
  url: string;
  score: number;
}
