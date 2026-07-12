export interface Sop {
  id: string;
  name: string;
  description: string;
  docLink: string;
  owner?: string;
  tags?: string[];
  tagIds?: string[];
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export type SopInput = Pick<Sop, "name" | "description" | "docLink" | "owner" | "tags" | "sortOrder">;
