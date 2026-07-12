import Link from "next/link";
import type { SearchAssetType } from "@/types/search";

const filters: { id?: SearchAssetType; label: string }[] = [
  { label: "全部" },
  { id: "product", label: "Vibe Product" },
  { id: "component", label: "组件规范" },
  { id: "sop", label: "标准 SOP" },
  { id: "skill", label: "Skill" },
  { id: "font", label: "字体" },
  { id: "prompt", label: "Prompt" },
  { id: "training", label: "培训资料" }
];

export function SearchFilters({ selectedType, keyword }: { selectedType?: string; keyword?: string }) {
  return (
    <nav className="flex flex-wrap gap-2" aria-label="搜索资产类型">
      {filters.map((filter) => {
        const params = new URLSearchParams();
        if (keyword) params.set("q", keyword);
        if (filter.id) params.set("type", filter.id);
        const href = params.size ? `/search?${params.toString()}` : "/search";
        const active = filter.id ? selectedType === filter.id : !selectedType;
        return (
          <Link key={filter.id ?? "all"} href={href} className={`inline-flex h-10 items-center border px-4 text-sm font-bold transition ${active ? "border-foreground bg-foreground text-white" : "border-foreground/[0.1] hover:border-foreground"}`}>
            {filter.label}
          </Link>
        );
      })}
    </nav>
  );
}
