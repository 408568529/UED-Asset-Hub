import { notFound } from "next/navigation";
import { AssetGrid } from "@/components/asset/AssetGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categories, categoryMeta } from "@/data/mock/categories";
import { assetService } from "@/services/assetService";
import type { AssetCategory } from "@/types/asset";

export function generateStaticParams() {
  return categories.map((category) => ({ category: category.id }));
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const categoryId = category as AssetCategory;
  const meta = categoryMeta[categoryId];
  if (!meta) notFound();

  const assets = await assetService.getAssetsByCategory(categoryId);
  const tags = Array.from(new Set(assets.flatMap((asset) => asset.tags.map((tag) => tag.name))));

  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <div className="rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-card">
        <Badge>{meta.tone}</Badge>
        <h1 className="mt-4 text-5xl font-black">{meta.name}</h1>
        <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">{meta.description}</p>
      </div>

      <div className="my-8 flex flex-col gap-4 rounded-[1.5rem] bg-white/70 p-4 shadow-card md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          <Badge className="border-foreground bg-foreground text-white">全部</Badge>
          {tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">最新</Button>
          <Button variant="ghost" size="sm">热门</Button>
          <Button variant="ghost" size="sm">收藏</Button>
        </div>
      </div>

      <AssetGrid assets={assets} />
    </div>
  );
}
