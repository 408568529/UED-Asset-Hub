import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AssetCard } from "@/components/asset/AssetCard";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/types/asset";
import { SectionHeader } from "./SectionHeader";

export function FeaturedSection({
  index,
  eyebrow,
  title,
  description,
  assets
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  assets: Asset[];
}) {
  return (
    <section className="brand-container py-16 md:py-24">
      <div className="relative">
        <SectionHeader index={index} eyebrow={eyebrow} title={title} description={description} />
        <Button asChild variant="ghost" className="mb-8 md:absolute md:right-0 md:top-5 md:mb-0">
          <Link href="/search">
            查看更多
            <ArrowRight size={16} />
          </Link>
        </Button>
      </div>
      <div className="grid gap-x-6 gap-y-12 md:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset, index) => (
          <AssetCard key={asset.id} asset={asset} large={index === 0} />
        ))}
      </div>
    </section>
  );
}
