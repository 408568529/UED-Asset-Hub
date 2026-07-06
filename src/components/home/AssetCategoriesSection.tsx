import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import type { ModuleSummary } from "@/types/module";

export function AssetCategoriesSection({ modules }: { modules: ModuleSummary[] }) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 md:py-24">
      <Reveal>
        <div className="mb-10 border-t border-foreground/15 pt-6 md:mb-14">
          <div className="grid gap-6 md:grid-cols-[160px_1fr]">
            <p className="font-mono text-sm text-muted-foreground">01 — Asset Categories</p>
            <div>
              <h2 className="max-w-4xl text-4xl font-black leading-[1.02] md:text-6xl">快捷入口</h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
                开放 Vibe Product、Skill Center、组件规范和标准 SOP，数量实时读取本地数据，方便团队快速判断资产规模。
              </p>
            </div>
          </div>
        </div>
      </Reveal>
      <div className="grid border-t border-foreground/10 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module, index) => (
          <Reveal key={module.id} delay={index * 0.04}>
            <Link
              href={module.href}
              className="group block min-h-64 border-b border-foreground/10 px-1 py-8 transition md:px-8 lg:border-r lg:[&:nth-child(3n)]:border-r-0"
            >
              <div className="flex items-start justify-between gap-5">
                <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                <ArrowUpRight className="opacity-30 transition group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:opacity-100" size={20} />
              </div>
              <h3 className="mt-12 text-3xl font-black tracking-normal md:text-4xl">
                {module.name}
                <span className="ml-3 font-mono text-2xl text-muted-foreground">({module.count})</span>
              </h3>
              <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">{module.description}</p>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
