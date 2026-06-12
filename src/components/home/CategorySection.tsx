import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { categories } from "@/data/mock/categories";
import { SectionHeader } from "./SectionHeader";

export function CategorySection() {
  return (
    <section className="brand-container py-16 md:py-24">
      <SectionHeader
        index="01"
        eyebrow="Asset Categories"
        title="Browse By Intent"
        description="按团队真实使用场景组织资产入口，让规范、项目、Prompt 和 AI 产品更容易被找到。"
      />
      <div className="grid border-t border-black/15 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category, index) => (
          <Link
            key={category.id}
            href={`/category/${category.id}`}
            className="group min-h-56 border-b border-black/15 px-0 py-8 transition duration-300 hover:bg-[#0c0c0c] hover:px-6 hover:text-white md:border-r md:px-6"
          >
            <div className="flex items-start justify-between gap-6">
              <span className="text-sm font-bold text-muted-foreground transition group-hover:text-white/45">
                {String(index + 1).padStart(2, "0")}
              </span>
              <ArrowUpRight className="opacity-0 transition group-hover:opacity-100" size={22} />
            </div>
            <h3 className="mt-10 text-3xl font-black uppercase leading-none md:text-4xl">{category.name}</h3>
            <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground transition group-hover:text-white/62">{category.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
