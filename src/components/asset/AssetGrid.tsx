import type { Asset } from "@/types/asset";
import { AssetCard } from "./AssetCard";

export function AssetGrid({ assets }: { assets: Asset[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {assets.map((asset, index) => (
        <AssetCard key={asset.id} asset={asset} large={index === 0} />
      ))}
    </div>
  );
}
