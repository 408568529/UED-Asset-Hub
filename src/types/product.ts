export interface Product {
  id: string;
  name: string;
  description: string;
  link: string;
  coverUrl?: string;
  tags?: string[];
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductInput = Pick<Product, "name" | "description" | "link" | "coverUrl" | "tags" | "sortOrder">;
