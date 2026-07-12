export type SkillCategory = string;

export interface Skill {
  id: string;
  name: string;
  description: string;
  cover?: string;
  category: SkillCategory;
  categoryId?: string;
  version: string;
  authorName: string;
  uploadedBy: string;
  usageScenarios: string[];
  usageScenarioIds?: string[];
  author?: string;
  username?: string;
  tags: string[];
  tagIds?: string[];
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
