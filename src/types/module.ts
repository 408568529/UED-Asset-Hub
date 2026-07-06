export type OpenModuleId = "products" | "components" | "sops" | "skills";

export interface ModuleSummary {
  id: OpenModuleId;
  name: string;
  description: string;
  href: string;
  count: number;
  tone: string;
}
