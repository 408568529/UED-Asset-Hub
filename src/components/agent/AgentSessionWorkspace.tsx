"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ChevronRight, FileClock, LoaderCircle, Pencil, Plus, Save, X } from "lucide-react";
import { FormToast } from "@/components/admin/FormToast";
import { AlertDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AgentSession } from "@/agent-integration/types";
import { AgentConversationSurface } from "@/components/agent/AgentConversationSurface";

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚更新";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

async function getError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return body.message || fallback;
}

export function AgentSessionWorkspace() {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AgentSession | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const selected = useMemo(() => sessions.find((item) => item.id === selectedId) ?? null, [sessions, selectedId]);

  const showToast = useCallback((message: string, tone: "success" | "error" = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/agent/sessions", { cache: "no-store" });
      if (!response.ok) throw new Error(await getError(response, "无法读取会话列表。"));
      const items = await response.json() as AgentSession[];
      setSessions(items);
      setSelectedId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法读取会话列表。", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { void refresh(); }, [refresh]);

  const handleSessionActivity = useCallback(() => { void refresh(); }, [refresh]);
  const handleConversationError = useCallback((message: string) => showToast(message, "error"), [showToast]);

  async function createSession() {
    setCreating(true);
    try {
      const response = await fetch("/api/agent/sessions", { method: "POST" });
      if (!response.ok) throw new Error(await getError(response, "无法创建会话。"));
      const session = await response.json() as AgentSession;
      setSessions((current) => [session, ...current]);
      setSelectedId(session.id);
      showToast("已创建新的 Agent 会话。");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "无法创建会话。", "error");
    } finally {
      setCreating(false);
    }
  }

  async function saveTitle(session: AgentSession) {
    const title = draftTitle.trim();
    if (!title) return showToast("会话名称不能为空。", "error");
    try {
      const response = await fetch(`/api/agent/sessions/${encodeURIComponent(session.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title })
      });
      if (!response.ok) throw new Error(await getError(response, "会话重命名失败。"));
      setSessions((current) => current.map((item) => item.id === session.id ? { ...item, title } : item));
      setEditingId(null);
      showToast("会话名称已更新。");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "会话重命名失败。", "error");
    }
  }

  async function archiveSession() {
    if (!archiveTarget) return;
    const target = archiveTarget;
    setArchiving(target.id);
    try {
      const response = await fetch(`/api/agent/sessions/${encodeURIComponent(target.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await getError(response, "会话移除失败。"));
      const remaining = sessions.filter((item) => item.id !== target.id);
      setSessions(remaining);
      setSelectedId((current) => current === target.id ? remaining[0]?.id ?? null : current);
      showToast("会话已移入 DSH 归档。");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "会话移除失败。", "error");
    } finally {
      setArchiving(null);
      setArchiveTarget(null);
    }
  }

  return (
    <section className="mt-8 border-y border-border">
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      <div className="grid min-h-[28rem] lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-border bg-[hsl(var(--surface))] p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">DSH Sessions</p>
              <h2 className="mt-2 text-xl font-black">工作会话</h2>
            </div>
            <Button type="button" size="icon" aria-label="新建会话" title="新建会话" onClick={() => void createSession()} disabled={creating}>
              {creating ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={18} />}
            </Button>
          </div>

          <div className="mt-5 space-y-1">
            {loading ? <p className="py-6 text-sm text-muted-foreground">正在读取 DSH 会话...</p> : null}
            {!loading && sessions.length === 0 ? <p className="py-6 text-sm leading-7 text-muted-foreground">暂无会话。新建一个会话后，后续对话能力会接入这个工作区。</p> : null}
            {sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setSelectedId(session.id)}
                className={`flex w-full items-center gap-3 border px-3 py-3 text-left transition-colors ${selectedId === session.id ? "border-foreground bg-foreground text-white" : "border-transparent hover:border-border hover:bg-[hsl(var(--surface-subtle))]"}`}
              >
                <FileClock size={16} className={selectedId === session.id ? "text-primary" : "text-muted-foreground"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{session.title || "未命名会话"}</span>
                  <span className={`mt-1 block text-xs ${selectedId === session.id ? "text-white/60" : "text-muted-foreground"}`}>{formatUpdatedAt(session.updatedAt)}</span>
                </span>
                <ChevronRight size={15} className={selectedId === session.id ? "text-white/70" : "text-muted-foreground"} />
              </button>
            ))}
          </div>
        </aside>

        <div className="p-6 md:p-8">
          {selected ? (
            <div className="flex h-full flex-col">
              <div className="flex flex-wrap items-start justify-between gap-5 border-b border-border pb-6">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Agent Session</p>
                  {editingId === selected.id ? (
                    <div className="mt-3 flex max-w-xl gap-2">
                      <Input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={120} aria-label="会话名称" autoFocus />
                      <Button type="button" size="icon" aria-label="保存会话名称" title="保存" onClick={() => void saveTitle(selected)}><Save size={16} /></Button>
                      <Button type="button" variant="ghost" size="icon" aria-label="取消重命名" title="取消" onClick={() => setEditingId(null)}><X size={16} /></Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <h3 className="text-2xl font-black">{selected.title || "未命名会话"}</h3>
                      <Button type="button" variant="ghost" size="icon" aria-label="重命名会话" title="重命名" onClick={() => { setEditingId(selected.id); setDraftTitle(selected.title || ""); }}><Pencil size={16} /></Button>
                    </div>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setArchiveTarget(selected)} disabled={archiving === selected.id}>
                  <Archive size={15} /> 移除
                </Button>
              </div>

              <AgentConversationSurface session={selected} onSessionActivity={handleSessionActivity} onError={handleConversationError} />
            </div>
          ) : (
            <div className="flex min-h-64 items-center justify-center text-center">
              <div><p className="text-lg font-black">选择或新建会话</p><p className="mt-2 text-sm text-muted-foreground">会话数据仅保留在独立 Agent 运行目录。</p></div>
            </div>
          )}
        </div>
      </div>

      {archiveTarget ? (
        <AlertDialog label="确认移除会话">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Archive session</p>
          <h2 className="mt-3 text-2xl font-black">移除这个会话？</h2>
          <p className="mt-4 text-sm leading-7 text-muted-foreground">“{archiveTarget.title || "未命名会话"}”会从当前会话列表移除，并使用 DSH 原生 Archive 保留原始 Session JSONL，不会物理删除。</p>
          <div className="mt-7 flex justify-end gap-3"><Button type="button" variant="ghost" onClick={() => setArchiveTarget(null)}>取消</Button><Button type="button" variant="destructive" onClick={() => void archiveSession()} disabled={archiving === archiveTarget.id}>{archiving === archiveTarget.id ? "正在移除" : "确认移除"}</Button></div>
        </AlertDialog>
      ) : null}
    </section>
  );
}
