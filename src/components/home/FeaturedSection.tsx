import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AssetCard } from "@/components/asset/AssetCard";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/types/asset";

export function FeaturedSection({ title, description, assets }: { title: string; description: string; assets: Asset[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-10">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-black">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/search">
            查看更多
            <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset, index) => (
          <AssetCard key={asset.id} asset={asset} large={index === 0} />
        ))}
      </div>
    </section>
  );
}
