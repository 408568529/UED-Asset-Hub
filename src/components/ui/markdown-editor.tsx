"use client";

import dynamic from "next/dynamic";

const MarkdownEditorClient = dynamic(
  () => import("@/components/ui/markdown-editor-client").then((module) => module.MarkdownEditorClient),
  { ssr: false, loading: () => <div className="min-h-[var(--markdown-editor-min-height)] border border-input bg-[hsl(var(--surface-raised))] p-4 text-sm text-muted-foreground">正在加载 Markdown 编辑器…</div> }
);

export function MarkdownEditor({ markdown, onChange }: { markdown: string; onChange: (markdown: string) => void }) {
  return <MarkdownEditorClient markdown={markdown} onChange={onChange} />;
}
