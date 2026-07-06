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
      whileHover={{ y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="group bg-transparent"
    >
      <Link href={`/assets/${asset.id}`} className="block">
        <div className={large ? "relative aspect-[16/10] overflow-hidden rounded-[2rem]" : "relative aspect-[5/4] overflow-hidden rounded-[2rem]"}>
          <Image src={asset.coverUrl} alt={asset.title} fill className="object-cover transition duration-700 group-hover:scale-105" sizes="(max-width: 768px) 100vw, 33vw" />
          <div className="absolute left-5 top-5 rounded-full bg-[#f7f6f0]/90 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] backdrop-blur">
            {categoryMeta[asset.category].name}
          </div>
        </div>
        <div className="space-y-5 px-1 py-6">
          <div className="flex flex-wrap gap-2">
            {asset.tags.slice(0, 3).map((tag) => (
              <Badge key={tag.id}>{tag.name}</Badge>
            ))}
          </div>
          <div>
            <h3 className={large ? "text-3xl font-black leading-tight md:text-4xl" : "text-2xl font-black leading-tight"}>{asset.title}</h3>
            <p className="mt-3 line-clamp-2 text-base leading-7 text-muted-foreground">{asset.excerpt}</p>
          </div>
          <AssetMeta asset={asset} />
        </div>
      </Link>
    </motion.article>
  );
}
