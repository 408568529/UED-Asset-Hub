import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SearchBox } from "@/components/search/SearchBox";
import { SearchFilters } from "@/components/search/SearchFilters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { searchService } from "@/services/searchService";
import type { SearchAssetType } from "@/types/search";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; tag?: string }> }) {
  const params = await searchParams;
  const results = await searchService.search({
    keyword: params.q,
    types: params.type ? [params.type as SearchAssetType] : undefined,
    tags: params.tag ? [params.tag] : undefined
  });

  return (
    <main className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <header className="border-b border-foreground/[0.1] pb-10">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Asset Search</p>
        <h1 className="mt-5 text-3xl font-black md:text-5xl">搜索真实团队资产</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">搜索结果实时读取产品、规范、Skill、字体、Prompt、培训资料和测试环境元数据。</p>
        <div className="mt-8"><SearchBox placeholder={params.q || "输入名称、标签、作者或使用场景"} /></div>
        <div className="mt-5"><SearchFilters selectedType={params.type} keyword={params.q} /></div>
      </header>

      <div className="mt-8 flex items-center justify-between font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">
        <span>{params.q ? `“${params.q.trim()}”` : "All Assets"}</span>
        <span>{results.length} Results</span>
      </div>

      <section className="mt-4 border-t border-foreground/[0.1]">
        {results.map((result) => (
          <Link key={`${result.type}-${result.id}`} href={result.url} className="group grid gap-5 border-b border-foreground/[0.1] py-7 transition-colors hover:bg-white/65 md:grid-cols-[160px_1fr_auto] md:items-center">
            <div>
              <Badge>{result.typeLabel}</Badge>
              <p className="mt-3 font-mono text-xs text-muted-foreground">{result.updatedAt.slice(0, 10)}</p>
            </div>
            <div>
              <h2 className="text-xl font-black md:text-2xl">{result.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{result.excerpt}</p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {result.author ? <span>作者 · {result.author}</span> : null}
                {result.tags.slice(0, 4).map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            </div>
            <ArrowUpRight className="transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" size={20} />
          </Link>
        ))}
        {!results.length ? (
          <div className="border-b border-foreground/[0.1] py-16 text-center">
            <p className="text-xl font-black">未找到与“{params.q?.trim() ?? ""}”相关的资产</p>
            <p className="mt-3 text-sm text-muted-foreground">请尝试更换关键词或筛选条件</p>
            <Button asChild className="mt-6"><Link href="/search">清空筛选</Link></Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
