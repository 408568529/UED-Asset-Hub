export interface ComponentSpec {
  id: string;
  name: string;
  description: string;
  docLink: string;
  figmaLink?: string;
  tags?: string[];
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export type ComponentSpecInput = Pick<ComponentSpec, "name" | "description" | "docLink" | "figmaLink" | "tags" | "sortOrder">;
