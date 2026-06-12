"use client";

import { motion } from "framer-motion";

export function SectionHeader({
  index,
  eyebrow,
  title,
  description
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="mb-10 border-t border-black/15 pt-5"
    >
      <div className="grid gap-5 md:grid-cols-[160px_1fr]">
        <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-normal text-muted-foreground">
          <span>{index}</span>
          <span className="h-px w-10 bg-black/25" />
          <span>{eyebrow}</span>
        </div>
        <div className="max-w-5xl">
          <h2 className="text-4xl font-black uppercase leading-[0.95] tracking-normal md:text-6xl">{title}</h2>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}
