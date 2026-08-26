export default function KnowledgeLoading() {
  return (
    <main className="knowledge-workspace flex min-h-[calc(100dvh-4.5rem)]" aria-busy="true" aria-label="正在加载知识库">
      <div className="hidden w-60 shrink-0 border-r border-border bg-[hsl(var(--surface-subtle)/0.48)] lg:block" />
      <section className="min-w-0 flex-1 bg-[hsl(var(--surface))]">
        <div className="border-b border-border px-4 py-4 md:px-6"><div className="h-5 w-32 animate-pulse bg-muted" /><div className="mt-3 h-10 w-full max-w-3xl animate-pulse bg-muted" /></div>
        <div className="border-b border-border px-4 py-3 md:px-6"><div className="h-8 w-full max-w-xl animate-pulse bg-muted" /></div>
        <div className="space-y-px">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-16 animate-pulse bg-muted/55" />)}</div>
      </section>
    </main>
  );
}
