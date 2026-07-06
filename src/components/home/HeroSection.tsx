"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/search/SearchBox";
import type { ModuleSummary } from "@/types/module";

export function HeroSection({ modules }: { modules: ModuleSummary[] }) {
  const totalCount = modules.reduce((sum, module) => sum + module.count, 0);

  return (
    <section className="relative overflow-hidden border-b border-foreground/10">
      <div className="mx-auto max-w-7xl px-5 pb-16 pt-20 md:pb-24 md:pt-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_360px] lg:items-end">
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">Design Asset Community</p>
            <h1 className="mt-8 max-w-6xl text-[clamp(4.5rem,13vw,9.5rem)] font-black leading-[0.88] tracking-normal text-foreground">
              Create. Collect. Reuse.
            </h1>
            <p className="mt-8 max-w-2xl text-xl leading-9 text-muted-foreground md:text-2xl">
              统一管理团队产品、组件规范与标准 SOP，让资产可访问、可搜索、可复用。
            </p>
            <div className="mt-10 max-w-2xl">
              <SearchBox />
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/products">
                  浏览产品
                  <ArrowRight size={16} />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/sops">查看标准 SOP</Link>
              </Button>
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-foreground/15 pt-6 lg:border-l lg:border-t-0 lg:pl-8"
          >
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Studio Index</p>
            <div className="mt-8 grid grid-cols-2 gap-8 lg:grid-cols-1">
              <div>
                <p className="text-6xl font-black leading-none">{totalCount}</p>
                <p className="mt-2 text-sm text-muted-foreground">本地资产</p>
              </div>
              <div>
                <p className="text-6xl font-black leading-none">{modules.length}</p>
                <p className="mt-2 text-sm text-muted-foreground">开放模块</p>
              </div>
            </div>
            <p className="mt-10 text-sm leading-7 text-muted-foreground">
              当前开放 Vibe Product、Skill Center、组件规范和标准 SOP，本地服务器运行，本地硬盘保存数据。
            </p>
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
