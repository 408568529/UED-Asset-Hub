"use client";

import { resolveHaldurMarkdownLink } from "@/lib/haldurMarkdownLinks";
import { ArrowLeft, Eye, Pencil, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MarkdownKnowledgeDetail } from "@/components/knowledge/MarkdownKnowledgeDetail";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { MarkdownRenderer } from "@/components/ui/markdown-renderer";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HaldurDesignSkillSnapshot } from "@/types/haldurDesignSkill";

export type HaldurMarkdownDocument = { path: string; name: string; content: string; revision: string; size: number; readOnly: boolean };

export function HaldurMarkdownDocumentPanel({ document, onClose, onSaved, canManage = false }: { canManage?: boolean; document: HaldurMarkdownDocument; onClose: () => void; onSaved: (snapshot: HaldurDesignSkillSnapshot) => void }) {
  const [content, setContent] = useState(document.content);
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [editorView, setEditorView] = useState<"source" | "preview">("source");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = content !== document.content;
  const canEdit = canManage && !document.readOnly;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function leave() {
    if (dirty && !window.confirm("当前修改尚未保存，确定离开吗？")) return;
    onClose();
  }

  async function save() {
    setSaving(true); setNotice(null);
    try {
      const response = await fetch("/api/haldur-design-skill/files/content", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: document.path, content, revision: document.revision }) });
      const payload = await response.json() as { code?: string; message?: string; snapshot?: HaldurDesignSkillSnapshot };
      if (!response.ok || !payload.snapshot) {
        setNotice(payload.code === "REVISION_CONFLICT" ? "文档已发生变化。为避免覆盖最新内容，请重新加载后确认。" : payload.message ?? "保存失败，请稍后重试。");
        return;
      }
      onSaved(payload.snapshot);
    } catch {
      setNotice("保存未确认完成，请重新加载后核对真实文件。");
    } finally {
      setSaving(false);
    }
  }

  const title = useMemo(() => document.path.split("/").slice(0, -1).join(" / "), [document.path]);
  return <section className="haldur-markdown-document min-w-0 bg-[hsl(var(--surface))]" aria-label={`${document.name} Markdown 文档`}>
    <header className="haldur-document-header">
      <div className="haldur-document-actions">
        <button type="button" onClick={leave} className="haldur-document-back inline-flex items-center gap-2 text-muted-foreground transition hover:text-foreground"><ArrowLeft size={16} />返回文件列表</button>
        <div className="flex items-center gap-2">{mode === "read" && canEdit ? <Button onClick={() => setMode("edit")}><Pencil size={15} />编辑</Button> : null}{mode === "edit" ? <><Button variant="outline" onClick={leave} disabled={saving}>取消</Button><Button onClick={() => void save()} disabled={!dirty || saving}>{saving ? "保存中…" : <><Save size={15} />保存</>}</Button></> : null}</div>
      </div>
      <div className="haldur-document-intro"><h2>{document.name}</h2><p>{title || "Haldur-Design-Skill"} · {document.size} B</p></div>
    </header>
    {document.readOnly ? <p className="border-b border-amber-700/25 bg-amber-50 px-4 py-3 text-sm text-amber-950 md:px-6">当前处于恢复只读状态，可以阅读但不能保存。</p> : null}
    {notice ? <p role="alert" className="border-b border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive md:px-6">{notice}</p> : null}
    {mode === "read" ? <div className="haldur-document-content"><MarkdownKnowledgeDetail content={document.content} resolveLink={(href) => resolveHaldurMarkdownLink(document.path, href)} /></div> : <><div className="haldur-document-tabs border-b border-border px-4 md:px-6"><TabsList className="gap-5 border-b-0"><TabsTrigger active={editorView === "source"} onClick={() => setEditorView("source")}><Pencil size={14} />编辑</TabsTrigger><TabsTrigger active={editorView === "preview"} onClick={() => setEditorView("preview")}><Eye size={14} />预览</TabsTrigger></TabsList></div>{editorView === "source" ? <div className="haldur-document-content"><MarkdownEditor markdown={content} onChange={setContent} /></div> : <div className="haldur-document-content"><MarkdownRenderer content={content} resolveLink={(href) => resolveHaldurMarkdownLink(document.path, href)} /></div>}</>}
  </section>;
}
