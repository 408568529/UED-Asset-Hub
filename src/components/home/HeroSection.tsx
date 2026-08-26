"use client";

import Link from "next/link";
import { ArrowUpRight, MoveUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { SearchBox } from "@/components/search/SearchBox";
import type { ModuleSummary } from "@/types/module";
import { AssetFlowCanvas } from "@/components/home/AssetFlowCanvas";

const nodePositions = [
  [67, 16], [84, 24], [58, 34], [78, 44], [86, 57], [65, 63], [82, 77], [53, 78]
];

export function HeroSection({ modules }: { modules: ModuleSummary[] }) {
  const totalCount = modules.reduce((sum, module) => sum + module.count, 0);

  return (
    <section className="home-hero overflow-hidden">
      <AssetFlowCanvas modules={modules} />
      <div className="home-hero-grain" aria-hidden="true" />
      <div className="home-hero-vignette" aria-hidden="true" />
      <div className="page-shell relative z-10 flex min-h-[calc(100svh-4.5rem)] flex-col py-7 lg:py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[48rem] lg:pt-7"
        >
          <div className="flex items-center gap-3 text-[#b6ea4a]">
            <span className="h-2 w-2 bg-current" />
            <p className="font-mono text-[11px] uppercase tracking-[0.18em]">Design assets / live index</p>
          </div>
          <h1 className="home-hero-title mt-8 text-balance">
            <span>UED</span>
            <span>ASSET <strong className="font-inherit text-[#b6ea4a]">HUB</strong></span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-white/64 md:text-lg">
            团队产品、规范、Skill 与知识沉淀，组成一张随时可用的设计资产网络。
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.15em] text-white/48">
            <span>{totalCount} indexed assets</span>
            <span className="h-1 w-1 bg-[#b6ea4a]" />
            <span>{modules.length} active modules</span>
            <span className="h-1 w-1 bg-[#b6ea4a]" />
            <span>Local first</span>
          </div>
        </motion.div>

        <div className="relative z-10 mt-auto pt-10 lg:static">
          <div className="hidden lg:absolute lg:inset-0 lg:block" aria-label="资产模块入口">
            {modules.map((module, index) => {
              const [left, top] = nodePositions[index] ?? [68, 50];
              return (
                <motion.div key={module.id} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.18 + index * 0.045 }} className="home-asset-node" style={{ left: `${left}%`, top: `${top}%` }}>
                  <Link href={module.href} className="group block min-w-40 border border-white/15 bg-[#0b0f0d]/70 px-4 py-3 backdrop-blur-sm transition hover:-translate-y-1 hover:border-[#b6ea4a] hover:bg-[#111811]/92">
                    <div className="flex items-start justify-between gap-4">
                      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/45">{String(index + 1).padStart(2, "0")}</span>
                      <ArrowUpRight size={15} className="text-white/45 transition group-hover:text-[#b6ea4a]" />
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <span className="text-sm font-black text-[#edf2e7]">{module.name}</span>
                      <span className="font-mono text-xl font-bold tabular-nums text-[#b6ea4a]">{module.count}</span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
          <div className="grid border-l border-t border-white/12 sm:grid-cols-2 lg:hidden">
            {modules.map((module, index) => (
              <Link key={module.id} href={module.href} className="group flex min-h-24 items-end justify-between border-b border-r border-white/12 px-4 py-3 transition hover:bg-white/[0.06]">
                <div><span className="font-mono text-[10px] text-white/40">{String(index + 1).padStart(2, "0")}</span><p className="mt-2 text-sm font-black text-[#edf2e7]">{module.name}</p></div>
                <span className="font-mono text-xl font-bold tabular-nums text-[#b6ea4a]">{module.count}</span>
              </Link>
            ))}
          </div>
          <div className="mt-6 grid gap-3 border-t border-white/15 pt-5 lg:absolute lg:bottom-0 lg:left-0 lg:right-0 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <SearchBox tone="dark" target="/knowledge" placeholder="搜索资产名称、标签或使用场景" />
            <Link href="/knowledge" className="inline-flex min-h-12 items-center justify-center gap-2 border border-white/18 px-5 text-sm font-bold text-[#edf2e7] transition hover:border-[#b6ea4a] hover:text-[#b6ea4a]">
              进入知识库 <MoveUpRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
