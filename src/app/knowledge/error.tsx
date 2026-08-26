"use client";

import { Button } from "@/components/ui/button";

export default function KnowledgeError({ error: _error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  void _error;
  return (
    <main className="knowledge-workspace flex min-h-[calc(100dvh-4.5rem)]">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-[hsl(var(--surface-subtle)/0.48)] lg:block" />
      <section className="flex flex-1 items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-xl font-black">知识库加载失败</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">请重试。现有资产模块、详情页和管理后台不受影响。</p>
          <Button type="button" className="mt-6" onClick={reset}>重新加载</Button>
        </div>
      </section>
    </main>
  );
}
