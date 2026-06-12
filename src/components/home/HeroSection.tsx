"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/search/SearchBox";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-black/10">
      <div className="brand-container py-20 md:py-28">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-y border-black/15 py-4 text-xs font-bold uppercase text-muted-foreground">
            <span>Design Asset Community</span>
            <span>Collect / Curate / Reuse</span>
          </div>
          <h1 className="mt-10 max-w-7xl text-[64px] font-black uppercase leading-[0.86] tracking-normal text-foreground md:text-[118px] xl:text-[148px]">
            Create. Collect. Reuse.
          </h1>
          <div className="mt-10 grid gap-8 md:grid-cols-[1fr_520px] md:items-end">
            <p className="max-w-2xl text-xl leading-8 text-foreground md:text-2xl">
              统一沉淀设计资产，让经验被复用，让知识持续增长。
            </p>
            <div className="md:justify-self-end">
              <SearchBox />
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/topics">
                浏览专题
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/search">进入 AI 搜索</Link>
            </Button>
          </div>
        </motion.div>

        <div className="mt-16 grid gap-4 border-t border-black/15 pt-5 md:grid-cols-[1.3fr_0.7fr_0.7fr]">
          <div className="min-h-64 bg-[#0c0c0c] p-7 text-white">
            <p className="text-xs font-bold uppercase text-white/45">Featured Case</p>
            <h2 className="mt-12 max-w-xl text-5xl font-black uppercase leading-none">Portal Design System</h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/58">从导航、信息架构到组件范式，沉淀为可被复用的团队设计体系。</p>
          </div>
          <div className="min-h-64 border border-black/15 p-7">
            <p className="text-7xl font-black leading-none">18</p>
            <p className="mt-6 text-sm uppercase text-muted-foreground">Curated Assets</p>
          </div>
          <div className="min-h-64 bg-primary p-7">
            <p className="text-7xl font-black leading-none">05</p>
            <p className="mt-6 text-sm uppercase text-foreground/65">Featured Topics</p>
          </div>
        </div>
      </div>
    </section>
  );
}
