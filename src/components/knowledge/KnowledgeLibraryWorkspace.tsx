"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, Bot, Boxes, ExternalLink, FileText, GraduationCap, LoaderCircle, Search, SlidersHorizontal, Type, Wrench } from "lucide-react";
import { useState } from "react";
import { KnowledgeCreateMenu } from "@/components/knowledge/KnowledgeCreateMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { KnowledgeAssetType, KnowledgeAssetView, KnowledgeLibraryQuery, KnowledgeLibraryResult, KnowledgeSection } from "@/types/knowledge";

const sections: Array<{ id: "all" | KnowledgeSection; label: string; icon: typeof BookOpen }> = [
  { id: "all", label: "全部", icon: Boxes },
  { id: "document", label: "文档", icon: BookOpen },
  { id: "ai", label: "AI", icon: Bot },
  { id: "training", label: "培训", icon: GraduationCap },
  { id: "product-tool", label: "产品 / 工具", icon: Wrench },
  { id: "resource", label: "资源", icon: Type }
];

const types: Array<{ id: KnowledgeAssetType; label: string }> = [
  { id: "knowledge", label: "知识文章" },
  { id: "sop", label: "SOP" },
  { id: "component-spec", label: "组件规范" },
  { id: "micro-spec", label: "微规范" },
  { id: "project", label: "项目沉淀" },
  { id: "prompt", label: "Prompt" },
  { id: "skill", label: "Skill" },
  { id: "training", label: "培训资料" },
  { id: "vibe-product", label: "Vibe Product" },
  { id: "font", label: "Font" }
];

function buildHref(query: KnowledgeLibraryQuery, changes: Partial<KnowledgeLibraryQuery>) {
  const next = { ...query, ...changes };
  const params = new URLSearchParams();
  if (next.section && next.section !== "all") params.set("section", next.section);
  if (next.type) params.set("type", next.type);
  if (next.asset) params.set("asset", next.asset);
  if (next.category) params.set("category", next.category);
  if (next.tag) params.set("tag", next.tag);
  if (next.q) params.set("q", next.q);
  if (next.sort && next.sort !== "updated-desc") params.set("sort", next.sort);
  const value = params.toString();
  return value ? `/knowledge?${value}` : "/knowledge";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", year: "numeric" }).format(date);
}

function AssetIcon({ type }: { type: KnowledgeAssetType }) {
  const Icon = type === "knowledge" || type === "project" || type === "micro-spec" || type === "sop" ? FileText : type === "component-spec" ? Boxes : type === "prompt" ? Bot : type === "skill" ? Wrench : type === "training" ? GraduationCap : type === "vibe-product" ? ArrowUpRight : Type;
  return <Icon size={16} aria-hidden="true" />;
}

function AssetRow({ item, query }: { item: KnowledgeAssetView; query: KnowledgeLibraryQuery }) {
  const href = buildHref(query, { asset: item.key });

  function markNavigationPending(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.currentTarget.dataset.pending = "true";
    event.currentTarget.setAttribute("aria-busy", "true");
  }

  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-[hsl(var(--surface-subtle)/0.7)] text-foreground"><AssetIcon type={item.assetType} /></span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-bold tracking-[-0.01em]">{item.title}</h2>
            {item.route.kind === "external" ? <span className="hidden shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground sm:inline-flex"><ExternalLink size={11} /> 外部</span> : null}
          </div>
          <p className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">{item.assetType === "micro-spec" ? [item.specTopicLabel, ...(item.relatedScopeLabels ?? [])].filter(Boolean).join(" · ") : item.description || "暂无描述"}</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Badge>{item.assetTypeLabel}</Badge>
        <span className="hidden truncate text-xs text-muted-foreground xl:block">{item.businessCategory || "未分类"}</span>
      </div>
      <div className="hidden min-w-0 flex-wrap gap-1 lg:flex">
        {item.tags.slice(0, 2).map((tag) => <Badge key={tag} className="max-w-24 truncate">#{tag}</Badge>)}
        {!item.tags.length ? <span className="text-xs text-muted-foreground">—</span> : null}
      </div>
      <time dateTime={item.updatedAt} className="hidden text-xs tabular-nums text-muted-foreground md:block">{formatDate(item.updatedAt)}</time>
      <ArrowUpRight className="library-row-arrow ml-auto text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" size={16} aria-hidden="true" />
      <LoaderCircle className="library-row-loading ml-auto hidden animate-spin text-muted-foreground" size={16} aria-label="正在打开详情" />
    </>
  );

  const className = "library-row group grid min-h-16 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 lg:grid-cols-[minmax(18rem,1.8fr)_minmax(9rem,0.75fr)_minmax(10rem,0.9fr)_5.5rem_1.25rem] lg:gap-4 lg:px-6";
  return item.route.kind === "external"
    ? <a href={item.route.href} target="_blank" rel="noreferrer" className={className}>{content}</a>
    : <Link href={href} prefetch={false} onClick={markNavigationPending} className={className}>{content}</Link>;
}

function SecondaryNavigation({ activeSection, query }: { activeSection: "all" | KnowledgeSection; query: KnowledgeLibraryQuery }) {
  const documentTypes = types.filter((type) => type.id === "knowledge" || type.id === "sop" || type.id === "component-spec" || type.id === "micro-spec" || type.id === "project");
  const aiTypes = types.filter((type) => type.id === "prompt" || type.id === "skill");
  const activeTypes = activeSection === "document" ? documentTypes : activeSection === "ai" ? aiTypes : [];
  const title = activeSection === "document" ? "文档类型" : "AI 类型";

  if (!activeTypes.length) return null;
  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
      <div className="mt-2 grid gap-0.5">
        <Link href={buildHref(query, { asset: undefined, type: undefined, category: undefined, tag: undefined })} className={`px-2 py-2 text-sm ${!query.type ? "font-bold text-foreground" : "text-muted-foreground hover:text-foreground"}`}>全部{activeSection === "document" ? "文档" : " AI"}</Link>
        {activeTypes.map((type) => <Link key={type.id} href={buildHref(query, { asset: undefined, type: type.id, category: undefined, tag: undefined })} className={`px-2 py-2 text-sm ${query.type === type.id ? "font-bold text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{type.label}</Link>)}
      </div>
    </div>
  );
}

export function KnowledgeWorkspaceShell({ mode, sidebar, children }: { mode: "browse" | "authoring"; sidebar?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="knowledge-workspace flex min-w-0 flex-col" data-workspace-mode={mode} id="main-content">
      <div className="knowledge-workspace-shell flex min-h-[calc(100dvh-var(--app-header-height))] min-w-0 flex-1 flex-col lg:flex-row">
        {mode === "browse" ? sidebar : null}
        <section className="knowledge-workspace-main flex min-w-0 flex-1 flex-col bg-[hsl(var(--surface))]" aria-label={mode === "browse" ? "知识资产工作区" : "知识内容创作工作区"}>
          {children}
        </section>
      </div>
    </main>
  );
}

export function KnowledgeLibraryWorkspace({ result, query, children }: { result: KnowledgeLibraryResult; query: KnowledgeLibraryQuery; children?: React.ReactNode }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(query.q ?? "");
  const activeSection = query.section ?? "all";
  const failedSources = result.sourceStates.filter((source) => source.status === "rejected");
  const allFailed = failedSources.length === result.sourceStates.length;
  const hasFilters = Boolean(query.q || query.type || query.category || query.tag || (query.section && query.section !== "all") || (query.sort && query.sort !== "updated-desc"));

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildHref(query, { q: keyword.trim() || undefined }));
  }

  function updateFilters(changes: Partial<KnowledgeLibraryQuery>) {
    router.push(buildHref(query, changes));
  }

  const isDetail = Boolean(children);

  return (
    <KnowledgeWorkspaceShell mode="browse" sidebar={
      <aside className="knowledge-workspace-sidebar w-full shrink-0 border-b border-border bg-[hsl(var(--surface-subtle)/0.48)] px-3 py-3 lg:w-60 lg:border-b-0 lg:border-r lg:px-4 lg:py-5" aria-label="知识库分类侧栏">
          <div className="flex items-center justify-between px-2 lg:block">
            <p className="text-sm font-black tracking-[-0.01em]">Knowledge Library</p>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground lg:mt-1 lg:block">{result.totalLoaded} assets indexed</span>
          </div>
          <nav className="mt-3 grid grid-cols-3 gap-1 sm:grid-cols-6 lg:grid-cols-1" aria-label="知识库分类">
            {sections.map((section) => {
              const Icon = section.icon;
              const active = activeSection === section.id;
              return <Link key={section.id} href={buildHref(query, { asset: undefined, section: section.id, type: undefined, category: undefined, tag: undefined })} className={`flex min-h-10 items-center gap-2 px-2.5 text-sm font-medium transition ${active ? "bg-foreground text-white" : "text-muted-foreground hover:bg-[hsl(var(--surface-raised))] hover:text-foreground"}`}><Icon size={15} />{section.label}</Link>;
            })}
          </nav>
          <div className="lg:hidden"><SecondaryNavigation activeSection={activeSection} query={query} /></div>
          <div className="hidden lg:block"><SecondaryNavigation activeSection={activeSection} query={query} /></div>
      </aside>
    }>
          {!isDetail ? <header className="border-b border-border px-4 py-4 md:px-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="flex min-w-0 items-center gap-3 xl:w-52 xl:shrink-0">
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-black tracking-[-0.025em]">{activeSection === "all" ? "全部知识资产" : sections.find((section) => section.id === activeSection)?.label}</h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">{result.items.length} 项结果</p>
                </div>
              </div>
              <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} aria-hidden="true" />
                  <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索知识资产" aria-label="搜索知识资产" className="pl-9" controlSize="md" />
                </div>
                <Button type="submit" size="md">搜索</Button>
              </form>
              <div className="self-end xl:self-auto"><KnowledgeCreateMenu returnTo={buildHref(query, { asset: undefined })} /></div>
            </div>
          </header> : null}

          {!isDetail ? <div className="flex flex-col gap-2 border-b border-border bg-[hsl(var(--surface-subtle)/0.36)] px-4 py-3 md:px-6 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><SlidersHorizontal size={15} />筛选与排序</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
              <Select aria-label="按类型筛选" value={query.type ?? ""} onChange={(event) => updateFilters({ type: event.target.value as KnowledgeAssetType || undefined, category: undefined, tag: undefined })} controlSize="sm" className="min-w-0 xl:min-w-32"><option value="">全部类型</option>{types.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</Select>
              <Select aria-label="按分类筛选" value={query.category ?? ""} onChange={(event) => updateFilters({ category: event.target.value || undefined })} controlSize="sm" className="min-w-0 xl:min-w-32"><option value="">全部分类</option>{result.categories.map((category) => <option key={category} value={category}>{category}</option>)}</Select>
              <Select aria-label="按标签筛选" value={query.tag ?? ""} onChange={(event) => updateFilters({ tag: event.target.value || undefined })} controlSize="sm" className="min-w-0 xl:min-w-32"><option value="">全部标签</option>{result.tags.map((tag) => <option key={tag} value={tag}>#{tag}</option>)}</Select>
              <Select aria-label="排序方式" value={query.sort ?? "updated-desc"} onChange={(event) => updateFilters({ sort: event.target.value as KnowledgeLibraryQuery["sort"] })} controlSize="sm" className="min-w-0 xl:min-w-32"><option value="updated-desc">最近更新</option><option value="title-asc">名称 A-Z</option><option value="title-desc">名称 Z-A</option></Select>
            </div>
          </div> : null}

          {!isDetail && failedSources.length ? <div role="status" className="border-b border-amber-700/20 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 md:px-6">部分内容暂不可用：{failedSources.map((source) => source.label).join("、")}。其余资产仍可正常浏览。</div> : null}

          <div key={isDetail ? "detail" : "list"} className="workspace-content-transition flex min-h-0 flex-1 flex-col">
          {isDetail ? children : <div className="flex min-h-0 flex-1 flex-col">
            <div className="hidden grid-cols-[minmax(18rem,1.8fr)_minmax(9rem,0.75fr)_minmax(10rem,0.9fr)_5.5rem_1.25rem] gap-4 border-b border-border bg-[hsl(var(--surface-subtle)/0.5)] px-6 py-2.5 font-mono text-[10px] uppercase tracking-[0.11em] text-muted-foreground lg:grid">
              <span>名称</span><span>类型 / 分类</span><span>标签</span><span>更新</span><span aria-hidden="true" />
            </div>
            {!allFailed && result.items.length ? <div className="library-list">{result.items.map((item) => <AssetRow key={item.key} item={item} query={query} />)}</div> : null}
            {!allFailed && !result.items.length ? <div className="flex flex-1 items-center justify-center px-5 py-16 text-center"><div><FileText className="mx-auto text-muted-foreground" size={26} aria-hidden="true" /><h2 className="mt-3 text-base font-black">没有匹配的知识资产</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">尝试更换关键词或清除筛选。</p>{hasFilters ? <Button asChild variant="outline" className="mt-5"><Link href="/knowledge">清空筛选</Link></Button> : null}</div></div> : null}
            {allFailed ? <div className="flex flex-1 items-center justify-center px-5 py-16 text-center"><div><h2 className="text-base font-black">知识库暂时无法读取</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">数据来源暂不可用，请稍后重试。现有模块页面与后台维护功能不受影响。</p><Button asChild variant="outline" className="mt-5"><Link href={buildHref(query, {})}>重新加载</Link></Button></div></div> : null}
          </div>}
          </div>
    </KnowledgeWorkspaceShell>
  );
}
