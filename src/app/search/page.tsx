import Link from "next/link";
import { Sparkles } from "lucide-react";
import { SearchBox } from "@/components/search/SearchBox";
import { SearchFilters } from "@/components/search/SearchFilters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { searchService } from "@/services/searchService";
import type { AssetCategory } from "@/types/asset";

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; category?: string; tag?: string }>;
}) {
  const params = await searchParams;
  const results = await searchService.search({
    keyword: params.q,
    category: params.category as AssetCategory | undefined,
    tags: params.tag ? [params.tag] : undefined
  });

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-8">
        <p className="text-sm font-medium text-primary">AI Search</p>
        <h1 className="mt-3 text-5xl font-black">搜索团队资产</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">先基于 mock 数据做前端搜索，后续可接入全文检索、向量数据库和 RAG 问答。</p>
      </div>
      <SearchBox placeholder={params.q || "输入关键词搜索资产、专题、Prompt..."} />
      <div className="mt-5">
        <SearchFilters selectedCategory={params.category} />
      </div>

      <section className="mt-8 rounded-[2rem] border border-primary/15 bg-primary/5 p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Sparkles size={18} />
          AI 搜索结果占位
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          未来会把关键词、用户权限、资产内容和向量检索结果一起送入 AI service，返回带引用来源的答案。
        </p>
      </section>

      <div className="mt-8 space-y-4">
        {results.map((result) => (
          <Link key={`${result.type}-${result.id}`} href={result.url} className="block rounded-[1.5rem] border border-white/70 bg-white p-5 shadow-card transition hover:-translate-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{result.type}</Badge>
              <span className="text-xs text-muted-foreground">相关度 {Math.round(result.score * 100)}%</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold">{result.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.excerpt}</p>
          </Link>
        ))}
        {!results.length ? (
          <div className="rounded-[1.5rem] bg-white p-8 text-center shadow-card">
            <p className="font-medium">没有找到结果</p>
            <p className="mt-2 text-sm text-muted-foreground">换个关键词，或回到全部分类再试一次。</p>
            <Button asChild className="mt-5">
              <Link href="/search">清空筛选</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
