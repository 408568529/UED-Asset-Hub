"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { categoryMeta } from "@/data/mock/categories";
import type { Asset } from "@/types/asset";
import { AssetMeta } from "./AssetMeta";

export function AssetCard({ asset, large = false }: { asset: Asset; large?: boolean }) {
  return (
    <motion.article
      whileHover={{ y: -6 }}
      transition={{ duration: 0.2 }}
      className="group overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-card"
    >
      <Link href={`/assets/${asset.id}`}>
        <div className={large ? "relative aspect-[16/9]" : "relative aspect-[4/3]"}>
          <Image src={asset.coverUrl} alt={asset.title} fill className="object-cover transition duration-500 group-hover:scale-105" sizes="(max-width: 768px) 100vw, 33vw" />
          <div className="absolute left-4 top-4 rounded-full bg-white/86 px-3 py-1 text-xs font-medium backdrop-blur">
            {categoryMeta[asset.category].name}
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            {asset.tags.slice(0, 3).map((tag) => (
              <Badge key={tag.id}>{tag.name}</Badge>
            ))}
          </div>
          <div>
            <h3 className={large ? "text-2xl font-bold leading-tight" : "text-lg font-bold leading-snug"}>{asset.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{asset.excerpt}</p>
          </div>
          <AssetMeta asset={asset} />
        </div>
      </Link>
    </motion.article>
  );
}
