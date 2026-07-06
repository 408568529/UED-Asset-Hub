import { AssetCard } from "@/components/asset/AssetCard";
import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/home/SectionHeading";
import type { Asset } from "@/types/asset";

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
    <section className="mx-auto max-w-7xl px-5 py-16 md:py-24">
      <Reveal>
        <SectionHeading index={index} eyebrow={eyebrow} title={title} description={description} href="/search" action="查看更多" />
      </Reveal>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {assets.map((asset, index) => (
          <Reveal key={asset.id} delay={index * 0.04}>
            <AssetCard asset={asset} large={index === 0} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
