export type PromptModel = "ChatGPT" | "Codex" | "Claude" | "Cursor" | "Gemini" | "DeepSeek";
export type PromptDifficulty = "初级" | "中级" | "高级";
export type PromptOutputType = "Markdown" | "HTML" | "React" | "JSON" | "Text" | "Image" | "Table";

export interface PromptAsset {
  id: string;
  name: string;
  summary: string;
  cover?: string;
  category: string;
  categoryId?: string;
  tags: string[];
  tagIds?: string[];
  author: string;
  version: string;
  models: PromptModel[];
  scenarios: string[];
  scenarioIds?: string[];
  outputTypes: PromptOutputType[];
  difficulty: PromptDifficulty;
  rating: number;
  content: string;
  usageGuide: string;
  exampleInput: string;
  exampleOutput: string;
  viewCount: number;
  copyCount: number;
  createdAt: string;
  updatedAt: string;
}

export type PromptInput = Pick<
  PromptAsset,
  "name" | "summary" | "cover" | "category" | "tags" | "author" | "version" | "models" | "scenarios" | "outputTypes" | "difficulty" | "rating" | "content" | "usageGuide" | "exampleInput" | "exampleOutput"
>;
