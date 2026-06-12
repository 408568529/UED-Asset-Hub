"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { Topic } from "@/types/topic";

export function TopicCard({ topic }: { topic: Topic }) {
  return (
    <motion.article whileHover={{ y: -5 }} className="overflow-hidden rounded-[1.75rem] border border-white/70 bg-white shadow-card">
      <Link href={`/topics/${topic.id}`}>
        <div className="relative aspect-[16/10]">
          <Image src={topic.coverUrl} alt={topic.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            {topic.tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
          <div>
            <h3 className="text-xl font-bold">{topic.title}</h3>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{topic.description}</p>
          </div>
          <p className="text-xs text-muted-foreground">策展人 {topic.curator} · {topic.assetIds.length} 篇资产</p>
        </div>
      </Link>
    </motion.article>
  );
}
