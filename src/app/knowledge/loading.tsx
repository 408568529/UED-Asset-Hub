import { KnowledgeWorkspaceShell } from "@/components/knowledge/KnowledgeLibraryWorkspace";

export default function KnowledgeLoading() {
  return (
    <div className="knowledge-skeleton" role="status" aria-busy="true" aria-label="正在加载知识库">
      <span className="sr-only">正在加载知识库…</span>
      <KnowledgeWorkspaceShell mode="browse" sidebar={
        <aside className="knowledge-workspace-sidebar w-full shrink-0 px-3 py-3 lg:px-4 lg:py-5" aria-hidden="true">
          <div className="px-2"><div className="knowledge-skeleton-block h-4 w-32" /><div className="knowledge-skeleton-block mt-2 h-3 w-24" /></div>
          <div className="mt-3 grid grid-cols-3 gap-1 sm:grid-cols-6 lg:grid-cols-1">
            {Array.from({ length: 6 }, (_, index) => <div key={index} className="flex min-h-10 items-center px-2.5"><span className="knowledge-skeleton-block h-3 w-16" /></div>)}
          </div>
        </aside>
      }>
        <div aria-hidden="true">
          <header className="knowledge-list-header">
            <div className="knowledge-list-heading"><div><div className="knowledge-skeleton-block h-[30px] w-40" /><div className="knowledge-skeleton-block mt-1 h-3 w-20" /></div><div className="knowledge-skeleton-block h-9 w-24" /></div>
            <div className="knowledge-search flex gap-2"><div className="knowledge-skeleton-block h-8 min-w-0 flex-1" /><div className="knowledge-skeleton-block h-8 w-12" /></div>
          </header>
          <div className="knowledge-list-filters"><div className="knowledge-skeleton-block h-3 w-20" /><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="knowledge-skeleton-block h-8 w-32 max-w-full" />)}</div></div>
          <div className="knowledge-skeleton-table-heading hidden h-9 lg:block" />
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="knowledge-skeleton-row library-row knowledge-list-columns grid min-h-[67px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 py-3 lg:grid-cols-[minmax(18rem,1.8fr)_minmax(9rem,0.75fr)_minmax(10rem,0.9fr)_5.5rem_1.25rem] lg:gap-4">
              <div className="flex min-w-0 items-center gap-3"><div className="knowledge-skeleton-block h-8 w-8 shrink-0" /><div className="min-w-0 flex-1"><div className="knowledge-skeleton-block h-3.5 w-3/4" /><div className="knowledge-skeleton-block mt-2 h-3 w-1/2" /></div></div>
              <div className="knowledge-skeleton-block h-5 w-16" /><div className="knowledge-skeleton-block hidden h-5 w-20 lg:block" /><div className="knowledge-skeleton-block hidden h-3 w-16 md:block" /><div className="knowledge-skeleton-block h-3 w-3" />
            </div>
          ))}
        </div>
      </KnowledgeWorkspaceShell>
    </div>
  );
}
