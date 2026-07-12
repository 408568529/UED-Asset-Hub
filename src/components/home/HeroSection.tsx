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
    <section className="relative overflow-hidden border-b border-black/[0.06]">
      <div className="pointer-events-none absolute inset-y-0 right-[18%] hidden w-px bg-foreground/[0.06] lg:block" />
      <div className="mx-auto max-w-7xl px-5 pb-20 pt-16 md:pb-28 md:pt-24">
        <div className="grid gap-14 lg:grid-cols-[1fr_320px] lg:items-end">
          <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <div className="flex items-center gap-4">
              <span className="h-px w-12 bg-primary" />
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">Design Asset Community</p>
            </div>
            <h1 className="mt-8 max-w-6xl text-6xl font-black leading-[0.88] tracking-normal text-foreground sm:text-7xl lg:text-[7.5rem] xl:text-[8.75rem]">
              Create.<br />Collect.<br /><span className="text-muted-foreground">Reuse.</span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground md:text-xl md:leading-9">
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
            className="border-t border-black/[0.06] pt-6 lg:border-l lg:border-t-0 lg:pl-8"
          >
            <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>Studio Index</span>
              <span>Live</span>
            </div>
            <div className="mt-8 grid grid-cols-2 border-y border-foreground/[0.08] lg:grid-cols-1 lg:border-b-0">
              <div>
                <p className="py-6 text-5xl font-black leading-none md:text-6xl">{totalCount}</p>
                <p className="border-t border-foreground/[0.08] py-3 text-sm text-muted-foreground">本地资产</p>
              </div>
              <div className="border-l border-foreground/[0.08] pl-6 lg:border-l-0 lg:border-t lg:pl-0">
                <p className="py-6 text-5xl font-black leading-none md:text-6xl">{modules.length}</p>
                <p className="border-t border-foreground/[0.08] py-3 text-sm text-muted-foreground">开放模块</p>
              </div>
            </div>
            <p className="mt-8 text-sm leading-7 text-muted-foreground">
              本地服务器运行，本地硬盘保存数据。内容更新后，首页数量与模块索引同步读取。
            </p>
          </motion.aside>
        </div>
      </div>
    </section>
  );
}
