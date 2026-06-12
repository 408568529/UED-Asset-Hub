export interface Topic {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  assetIds: string[];
  tags: string[];
  curator: string;
  updatedAt: string;
}
