"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { Topic } from "@/types/topic";

export function TopicCard({ topic, index }: { topic: Topic; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="group border-t border-black/15"
    >
      <Link href={`/topics/${topic.id}`} className="grid gap-6 py-7 transition duration-300 hover:px-5 md:grid-cols-[120px_1fr_360px] md:items-center">
        <span className="text-5xl font-black leading-none text-black/20 transition group-hover:text-foreground">
          {String(index).padStart(2, "0")}
        </span>
        <div>
          <h3 className="text-3xl font-black uppercase leading-none md:text-5xl">{topic.title}</h3>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{topic.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {topic.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <p className="mt-4 text-xs font-semibold uppercase text-muted-foreground">Curated by {topic.curator} · {topic.assetIds.length} assets</p>
        </div>
        <div className="relative aspect-[16/10] overflow-hidden bg-black md:aspect-[4/3]">
          <Image
            src={topic.coverUrl}
            alt={topic.title}
            fill
            className="object-cover opacity-85 grayscale transition duration-700 group-hover:scale-105 group-hover:grayscale-0"
            sizes="(max-width: 768px) 100vw, 360px"
          />
        </div>
      </Link>
    </motion.article>
  );
}
