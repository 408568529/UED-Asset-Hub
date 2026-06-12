import { USE_MOCK } from "@/config/api";
import { topics } from "@/data/mock/topics";
import { request } from "@/lib/request";
import { assetService } from "@/services/assetService";
import type { Asset } from "@/types/asset";
import type { Topic } from "@/types/topic";

export const topicService = {
  async getTopics(): Promise<Topic[]> {
    if (USE_MOCK) return [...topics].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return request<Topic[]>("/api/topics");
  },

  async getTopicById(id: string): Promise<Topic | null> {
    if (USE_MOCK) return topics.find((topic) => topic.id === id) ?? null;
    return request<Topic>(`/api/topics/${id}`);
  },

  async getTopicAssets(id: string): Promise<Asset[]> {
    if (USE_MOCK) {
      const topic = topics.find((item) => item.id === id);
      if (!topic) return [];
      const allAssets = await assetService.getAssets();
      return topic.assetIds
        .map((assetId) => allAssets.find((asset) => asset.id === assetId))
        .filter((asset): asset is Asset => Boolean(asset));
    }
    return request<Asset[]>(`/api/topics/${id}/assets`);
  }
};
