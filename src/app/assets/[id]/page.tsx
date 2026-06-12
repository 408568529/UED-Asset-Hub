import Image from "next/image";
import { notFound } from "next/navigation";
import { Bookmark, Share2 } from "lucide-react";
import { AssetDetailContent } from "@/components/asset/AssetDetailContent";
import { AssetGrid } from "@/components/asset/AssetGrid";
import { AssetMeta } from "@/components/asset/AssetMeta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { categoryMeta } from "@/data/mock/categories";
import { assetService } from "@/services/assetService";

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await assetService.getAssetById(id);
  if (!asset) {
    notFound();
    return null;
  }

  const related = await assetService.getRelatedAssets(asset);

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="overflow-hidden rounded-[2rem] bg-white shadow-card">
        <div className="relative aspect-[21/9] min-h-72">
          <Image src={asset.coverUrl} alt={asset.title} fill className="object-cover" priority />
        </div>
        <div className="p-6 md:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-foreground bg-foreground text-white">{categoryMeta[asset.category].name}</Badge>
            {asset.tags.map((tag) => (
              <Badge key={tag.id}>{tag.name}</Badge>
            ))}
          </div>
          <h1 className="mt-5 max-w-4xl text-4xl font-black leading-tight md:text-6xl">{asset.title}</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-muted-foreground">{asset.excerpt}</p>
          <div className="mt-6 flex flex-col gap-4 border-y border-border py-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Image src={asset.author.avatarUrl} alt={asset.author.name} width={44} height={44} className="rounded-full object-cover" />
              <div>
                <p className="text-sm font-semibold">{asset.author.name}</p>
                <p className="text-xs text-muted-foreground">{asset.author.title} · {asset.publishedAt}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AssetMeta asset={asset} />
              <Button variant="outline" size="icon" aria-label="收藏">
                <Bookmark size={18} />
              </Button>
              <Button variant="outline" size="icon" aria-label="分享">
                <Share2 size={18} />
              </Button>
            </div>
          </div>
          <div className="mt-10">
            <AssetDetailContent asset={asset} />
          </div>
        </div>
      </div>

      <section className="mt-10 rounded-[2rem] border border-dashed border-border bg-white/70 p-6">
        <h2 className="text-2xl font-bold">评论区域</h2>
        <p className="mt-2 text-sm text-muted-foreground">后续接入登录、评论、权限和消息通知后，这里将展示团队讨论与补充案例。</p>
      </section>

      <section className="mt-12">
        <h2 className="mb-6 text-3xl font-black">相关推荐</h2>
        <AssetGrid assets={related} />
      </section>
    </div>
  );
}
