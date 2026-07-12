export type OpenModuleId = "products" | "components" | "sops" | "skills" | "fonts" | "prompts" | "training" | "testEnvironments";

export interface ModuleSummary {
  id: OpenModuleId;
  name: string;
  description: string;
  href: string;
  count: number;
  tone: string;
}
