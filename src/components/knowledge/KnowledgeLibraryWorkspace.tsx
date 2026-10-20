"use client";

import { WorkspaceNavLink } from "@/components/layout/WorkspaceNavLink";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, Bot, Boxes, ExternalLink, FileText, GraduationCap, Play, Search, SlidersHorizontal, Type, Wrench } from "lucide-react";
import { useState } from "react";
import { KnowledgeCreateMenu } from "@/components/knowledge/KnowledgeCreateMenu";
import { Button, Input, Select, Tag as Badge } from "antd";
import { KnowledgeThemeProvider } from "@/components/knowledge/KnowledgeThemeProvider";
import type { KnowledgeAssetType, KnowledgeAssetView, KnowledgeLibraryQuery, KnowledgeLibraryResult, KnowledgeSection } from "@/types/knowledge";

const sections: Array<{ id: "all" | KnowledgeSection; label: string; icon: typeof BookOpen }> = [
  { id: "all", label: "全部", icon: Boxes },
  { id: "document", label: "文档", icon: BookOpen },
  { id: "ai", label: "AI", icon: Bot },
  { id: "training", label: "培训", icon: GraduationCap },
  { id: "product-tool", label: "产品 / 工具", icon: Wrench },
  { id: "resource", label: "资源", icon: Type }
];

const types: Array<{ id: KnowledgeAssetType; label: string; section: KnowledgeSection }> = [
  { id: "knowledge", label: "知识文章", section: "document" },
  { id: "sop", label: "SOP", section: "document" },
  { id: "component-spec", label: "组件规范", section: "document" },
  { id: "project", label: "项目沉淀", section: "document" },
  { id: "prompt", label: "Prompt", section: "ai" },
  { id: "skill", label: "Skill", section: "ai" },
  { id: "training", label: "培训资料", section: "training" },
  { id: "vibe-product", label: "Vibe Product", section: "product-tool" },
  { id: "font", label: "Font", section: "resource" }
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

export function KnowledgeListHeader() { return <div className="knowledge-list-columns hidden grid-cols-[minmax(18rem,1.8fr)_minmax(9rem,0.75fr)_minmax(10rem,0.9fr)_5.5rem_1.25rem] gap-4 border-b border-border bg-[hsl(var(--surface-subtle)/0.5)] px-6 py-2.5 text-xs font-medium text-muted-foreground lg:grid">
              <span>名称</span><span>类型 / 分类</span><span>标签</span><span>更新</span><span aria-hidden="true" />
            </div>; }

export function AssetRow({ item, query }: { item: KnowledgeAssetView; query: KnowledgeLibraryQuery }) {
  const href = item.assetType === "micro-spec" ? item.route.href : buildHref(query, { asset: item.key });

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
    </>
  );

  const className = "library-row knowledge-list-columns group grid min-h-16 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 lg:grid-cols-[minmax(18rem,1.8fr)_minmax(9rem,0.75fr)_minmax(10rem,0.9fr)_5.5rem_1.25rem] lg:gap-4 lg:px-6";
  return item.route.kind === "external"
    ? <a href={item.route.href} target="_blank" rel="noreferrer" className={className}>{content}</a>
    : <a href={href} className={className}>{content}</a>;
}

function TrainingAssetCard({ item, query }: { item: KnowledgeAssetView; query: KnowledgeLibraryQuery }) {
  const [coverFailed, setCoverFailed] = useState(false);
  return (
    <a href={buildHref(query, { asset: item.key })} className="knowledge-training-card">
      <div className="knowledge-training-cover">
        {coverFailed ? <GraduationCap size={36} aria-hidden="true" /> : <Image src={`/api/training/videos/${encodeURIComponent(item.id)}/cover`} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover" onError={() => setCoverFailed(true)} />}
        <span className="knowledge-training-play"><Play size={18} fill="currentColor" aria-hidden="true" /></span>
      </div>
      <div className="knowledge-training-card-body">
        <p className="text-xs text-muted-foreground">{item.businessCategory || item.assetTypeLabel}</p>
        <h2 className="mt-2 line-clamp-2 text-base font-semibold">{item.title}</h2>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{item.description || "暂无描述"}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{item.tags.slice(0, 2).map((tag) => <Badge key={tag}>#{tag}</Badge>)}<time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time></div>
      </div>
    </a>
  );
}

function SecondaryNavigation({ activeSection, query }: { activeSection: "all" | KnowledgeSection; query: KnowledgeLibraryQuery }) {
  const activeTypes = activeSection === "document" || activeSection === "ai" ? types.filter((type) => type.section === activeSection) : [];
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

export function KnowledgeWorkspaceShell({ mode, sidebar, children, detail = false }: { mode: "browse" | "authoring"; sidebar?: React.ReactNode; children: React.ReactNode; detail?: boolean }) {
  return (
    <KnowledgeThemeProvider>
    <main className={`knowledge-workspace knowledge-theme knowledge-visual-theme flex min-w-0 flex-col${detail ? " knowledge-detail-theme" : ""}`} data-hub-visual="v1.1" data-workspace-view={detail ? "detail" : mode} data-workspace-mode={mode} id="main-content">
      <div className="knowledge-workspace-shell flex min-h-[calc(100dvh-var(--app-header-height))] min-w-0 flex-1 flex-col lg:flex-row">
        {mode === "browse" ? sidebar : null}
        <section className="knowledge-workspace-main flex min-w-0 flex-1 flex-col bg-[hsl(var(--surface))]" aria-label={mode === "browse" ? "知识资产工作区" : "知识内容创作工作区"}>
          {children}
        </section>
      </div>
    </main>
    </KnowledgeThemeProvider>
  );
}

export function KnowledgeLibraryWorkspace({ result, query, children }: { result: KnowledgeLibraryResult; query: KnowledgeLibraryQuery; children?: React.ReactNode }) {
  const router = useRouter();
  const [keyword, setKeyword] = useState(query.q ?? "");
  const activeSection = query.section ?? "all";
  const availableTypes = types.filter((type) => activeSection === "all" || type.section === activeSection);
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
  const trainingCards = activeSection === "training";

  return (
    <KnowledgeWorkspaceShell mode="browse" detail={isDetail} sidebar={
      <aside className="knowledge-workspace-sidebar w-full shrink-0 border-b border-border bg-[hsl(var(--surface-subtle)/0.48)] px-3 py-3 lg:w-60 lg:border-b-0 lg:border-r lg:px-4 lg:py-5" aria-label="知识库分类侧栏">
          <div className="flex items-center justify-between px-2 lg:block">
            <p className="text-sm font-black tracking-[-0.01em]">Knowledge Library</p>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground lg:mt-1 lg:block">{result.totalLoaded} assets indexed</span>
          </div>
          <nav className="mt-3 grid grid-cols-3 gap-1 sm:grid-cols-6 lg:grid-cols-1" aria-label="知识库分类">
            {sections.map((section) => {
              const Icon = section.icon;
              const active = activeSection === section.id;
              return <WorkspaceNavLink key={section.id} href={buildHref(query, { asset: undefined, section: section.id, type: undefined, category: undefined, tag: undefined })} active={active} className={active ? "knowledge-nav-active" : undefined}><Icon size={15} />{section.label}</WorkspaceNavLink>;
            })}
          </nav>
          <div className="lg:hidden"><SecondaryNavigation activeSection={activeSection} query={query} /></div>
          <div className="hidden lg:block"><SecondaryNavigation activeSection={activeSection} query={query} /></div>
      </aside>
    }>
          {!isDetail ? <header className={`knowledge-list-header${trainingCards ? " knowledge-training-header" : ""}`}>
            <div className="knowledge-list-heading">
              <div className="flex min-w-0 items-center gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-black tracking-[-0.025em]">{activeSection === "all" ? "全部知识资产" : sections.find((section) => section.id === activeSection)?.label}</h1>
                  <p className="mt-0.5 text-xs text-muted-foreground">{result.items.length} 项结果</p>
                </div>
              </div>
              <div className="shrink-0"><KnowledgeCreateMenu returnTo={buildHref(query, { asset: undefined })} /></div>
            </div>
              <form onSubmit={submitSearch} className="knowledge-search flex min-w-0 gap-2">
                <div className="relative min-w-0 flex-1">
                  <Input size="small" prefix={<Search className="text-muted-foreground" size={16} aria-hidden="true" />} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索知识资产" aria-label="搜索知识资产" />
                </div>
                <Button size="small" htmlType="submit">搜索</Button>
              </form>

          </header> : null}

          {!isDetail ? <div className="knowledge-list-filters">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><SlidersHorizontal size={15} />筛选与排序</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
              <Select size="small" aria-label="按类型筛选" value={query.type ?? ""} onChange={(value: string) => updateFilters({ type: value as KnowledgeAssetType || undefined, category: undefined, tag: undefined })} className="min-w-0 w-full xl:w-32" options={[{ value: "", label: "全部类型" }, ...availableTypes.map((type) => ({ value: type.id, label: type.label }))]} />
              <Select size="small" aria-label="按分类筛选" value={query.category ?? ""} onChange={(value: string) => updateFilters({ category: value || undefined })} className="min-w-0 w-full xl:w-32" options={[{ value: "", label: "全部分类" }, ...result.categories.map((category) => ({ value: category, label: category }))]} />
              <Select size="small" aria-label="按标签筛选" value={query.tag ?? ""} onChange={(value: string) => updateFilters({ tag: value || undefined })} className="min-w-0 w-full xl:w-32" options={[{ value: "", label: "全部标签" }, ...result.tags.map((tag) => ({ value: tag, label: `#${tag}` }))]} />
              <Select size="small" aria-label="排序方式" value={query.sort ?? "updated-desc"} onChange={(value: KnowledgeLibraryQuery["sort"]) => updateFilters({ sort: value })} className="min-w-0 w-full xl:w-32" options={[{ value: "updated-desc", label: "最近更新" }, { value: "title-asc", label: "名称 A-Z" }, { value: "title-desc", label: "名称 Z-A" }]} />
            </div>
          </div> : null}

          {!isDetail && failedSources.length ? <div role="status" className="border-b border-amber-700/20 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 md:px-6">部分内容暂不可用：{failedSources.map((source) => source.label).join("、")}。其余资产仍可正常浏览。</div> : null}

          <div key={isDetail ? "detail" : "list"} className="workspace-content-transition flex min-h-0 flex-1 flex-col">
          {isDetail ? children : <div className="flex min-h-0 flex-1 flex-col">
            {!trainingCards ? <KnowledgeListHeader /> : null}
            {!allFailed && result.items.length ? <div className={trainingCards ? "knowledge-training-grid" : "library-list"}>{result.items.map((item) => trainingCards ? <TrainingAssetCard key={item.key} item={item} query={query} /> : <AssetRow key={item.key} item={item} query={query} />)}</div> : null}
            {!allFailed && !result.items.length ? <div className="flex flex-1 items-center justify-center px-5 py-16 text-center"><div><FileText className="mx-auto text-muted-foreground" size={26} aria-hidden="true" /><h2 className="mt-3 text-base font-black">没有匹配的知识资产</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">尝试更换关键词或清除筛选。</p>{hasFilters ? <Button href="/knowledge" className="mt-5">清空筛选</Button> : null}</div></div> : null}
            {allFailed ? <div className="flex flex-1 items-center justify-center px-5 py-16 text-center"><div><h2 className="text-base font-black">知识库暂时无法读取</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">数据来源暂不可用，请稍后重试。现有模块页面与后台维护功能不受影响。</p><Button href={buildHref(query, {})} className="mt-5">重新加载</Button></div></div> : null}
          </div>}
          </div>
    </KnowledgeWorkspaceShell>
  );
}
