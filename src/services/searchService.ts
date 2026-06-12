import { assetService } from "@/services/assetService";
import { topicService } from "@/services/topicService";
import type { AssetCategory } from "@/types/asset";
import type { SearchResult } from "@/types/ai";

export const searchService = {
  async search(params: { keyword?: string; category?: AssetCategory; tags?: string[] }): Promise<SearchResult[]> {
    const [assets, topics] = await Promise.all([
      assetService.getAssets({ keyword: params.keyword, category: params.category, tags: params.tags }),
      topicService.getTopics()
    ]);

    const keyword = (params.keyword ?? "").toLowerCase();
    const topicResults = topics
      .filter((topic) => !keyword || [topic.title, topic.description, ...topic.tags].join(" ").toLowerCase().includes(keyword))
      .map<SearchResult>((topic) => ({
        id: topic.id,
        type: "topic",
        title: topic.title,
        excerpt: topic.description,
        url: `/topics/${topic.id}`,
        score: 0.82
      }));

    const assetResults = assets.map<SearchResult>((asset) => ({
      id: asset.id,
      type: "asset",
      title: asset.title,
      excerpt: asset.excerpt,
      url: `/assets/${asset.id}`,
      score: asset.featured ? 0.96 : 0.88
    }));

    return [...assetResults, ...topicResults].sort((a, b) => b.score - a.score);
  }
};
