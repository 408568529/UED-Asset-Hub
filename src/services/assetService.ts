import { USE_MOCK } from "@/config/api";
import { assets } from "@/data/mock/assets";
import { request } from "@/lib/request";
import type { Asset, AssetCategory, AssetQuery } from "@/types/asset";

function filterAssets(query: AssetQuery = {}) {
  let result = [...assets];

  if (query.category) {
    result = result.filter((asset) => asset.category === query.category);
  }

  if (query.keyword) {
    const keyword = query.keyword.toLowerCase();
    result = result.filter((asset) =>
      [asset.title, asset.excerpt, asset.content, asset.author.name, ...asset.tags.map((tag) => tag.name)]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }

  if (query.tags?.length) {
    result = result.filter((asset) => asset.tags.some((tag) => query.tags?.includes(tag.name) || query.tags?.includes(tag.id)));
  }

  switch (query.sort) {
    case "popular":
      result.sort((a, b) => b.views + b.likes - (a.views + a.likes));
      break;
    case "saved":
      result.sort((a, b) => b.saves - a.saves);
      break;
    case "latest":
    default:
      result.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }

  return query.limit ? result.slice(0, query.limit) : result;
}

export const assetService = {
  async getAssets(query?: AssetQuery): Promise<Asset[]> {
    if (USE_MOCK) return filterAssets(query);
    return request<Asset[]>("/api/assets", { query: query as Record<string, string | number | boolean | undefined> });
  },

  async getFeaturedAssets(): Promise<Asset[]> {
    if (USE_MOCK) return assets.filter((asset) => asset.featured).slice(0, 6);
    return request<Asset[]>("/api/assets/featured");
  },

  async getAssetById(id: string): Promise<Asset | null> {
    if (USE_MOCK) return assets.find((asset) => asset.id === id || asset.slug === id) ?? null;
    return request<Asset>(`/api/assets/${id}`);
  },

  async getAssetsByCategory(category: AssetCategory, query?: Omit<AssetQuery, "category">): Promise<Asset[]> {
    return this.getAssets({ ...query, category });
  },

  async getRelatedAssets(asset: Asset, limit = 3): Promise<Asset[]> {
    if (USE_MOCK) {
      return assets
        .filter((item) => item.id !== asset.id)
        .filter((item) => item.category === asset.category || item.tags.some((tag) => asset.tags.some((sourceTag) => sourceTag.id === tag.id)))
        .slice(0, limit);
    }
    return request<Asset[]>(`/api/assets/${asset.id}/related`, { query: { limit } });
  }
};
