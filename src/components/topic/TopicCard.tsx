"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { Topic } from "@/types/topic";

export function TopicCard({ topic, index = 0 }: { topic: Topic; index?: number }) {
  return (
    <motion.article whileHover={{ y: -6 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }} className="group border-t border-foreground/15 pt-5">
      <Link href={`/topics/${topic.id}`} className="grid gap-6 md:grid-cols-[120px_1fr]">
        <p className="font-mono text-sm text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
        <div>
          <div className="relative aspect-[16/8] overflow-hidden rounded-[2rem]">
            <Image src={topic.coverUrl} alt={topic.title} fill className="object-cover transition duration-700 group-hover:scale-105" sizes="(max-width: 768px) 100vw, 50vw" />
          </div>
          <div className="space-y-4 py-6">
            <div className="flex flex-wrap gap-2">
              {topic.tags.map((tag) => (
                <Badge key={tag}>{tag}</Badge>
              ))}
            </div>
            <div>
              <h3 className="text-3xl font-black leading-tight md:text-4xl">{topic.title}</h3>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{topic.description}</p>
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Curated by {topic.curator} · {topic.assetIds.length} assets</p>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}
