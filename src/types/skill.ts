export type SkillCategory = "Codex" | "Claude" | "Cursor" | "Prompt" | "Workflow" | "MCP" | "Other";

export interface Skill {
  id: string;
  name: string;
  description: string;
  cover?: string;
  category: SkillCategory;
  version: string;
  authorName: string;
  uploadedBy: string;
  usageScenarios: string[];
  author?: string;
  username?: string;
  tags: string[];
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  packagePath: string;
  readme: string;
  changeLog: string;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  packagePath: string;
  fileName: string;
  fileSize: number;
  readme: string;
  changeLog: string;
  operator: string;
  createdAt: string;
  downloadCount: number;
}

export type SkillInput = Pick<Skill, "name" | "description" | "cover" | "category" | "version" | "authorName" | "usageScenarios" | "tags" | "readme" | "changeLog">;
