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
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="group"
    >
      <Link href={`/assets/${asset.id}`} className="block">
        <div className={large ? "relative aspect-[16/11] overflow-hidden bg-black" : "relative aspect-[4/5] overflow-hidden bg-black"}>
          <Image
            src={asset.coverUrl}
            alt={asset.title}
            fill
            className="object-cover opacity-92 grayscale-[18%] transition duration-700 group-hover:scale-105 group-hover:grayscale-0"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
          <div className="absolute left-4 top-4 rounded-full bg-[#f6f4ee]/90 px-3 py-1 text-[11px] font-bold uppercase backdrop-blur">
            {categoryMeta[asset.category].name}
          </div>
        </div>
        <div className="space-y-5 border-b border-black/15 py-5">
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
