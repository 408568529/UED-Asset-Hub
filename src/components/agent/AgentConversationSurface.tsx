"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentConversation, AgentConversationMessage, AgentSession } from "@/agent-integration/types";

type AgentConversationSurfaceProps = {
  session: AgentSession;
  onSessionActivity: () => void;
  onError: (message: string) => void;
};

async function getError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return body.message || fallback;
}

export function AgentConversationSurface({ session, onSessionActivity, onError }: AgentConversationSurfaceProps) {
  const [conversation, setConversation] = useState<AgentConversation>({ messages: [], running: false });
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const refreshTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/agent/sessions/${encodeURIComponent(session.id)}/conversation`, { cache: "no-store" });
      if (!response.ok) throw new Error(await getError(response, "无法读取会话消息。"));
      setConversation(await response.json() as AgentConversation);
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法读取会话消息。");
    } finally {
      setLoading(false);
    }
  }, [onError, session.id]);

  useEffect(() => {
    setLoading(true);
    setConversation({ messages: [], running: false });
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const stream = new EventSource("/api/agent/events");
    const scheduleRefresh = () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        void refresh();
        onSessionActivity();
      }, 240);
    };

    stream.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data) as { payload?: { type?: string; sessionId?: string } };
        const frame = envelope.payload;
        if (frame?.type === "session/event" && frame.sessionId === session.id) scheduleRefresh();
      } catch {
        // Ignore malformed upstream frames; the next valid DSH event re-syncs history.
      }
    };

    return () => {
      stream.close();
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [onSessionActivity, refresh, session.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      const response = await fetch(`/api/agent/sessions/${encodeURIComponent(session.id)}/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      if (!response.ok) throw new Error(await getError(response, "消息发送失败。"));
      setDraft("");
      window.setTimeout(() => void refresh(), 500);
      onSessionActivity();
    } catch (error) {
      onError(error instanceof Error ? error.message : "消息发送失败。");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-[30rem] flex-1 flex-col pt-6">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {loading ? <p className="py-12 text-sm text-muted-foreground">正在读取会话历史...</p> : null}
        {!loading && conversation.messages.length === 0 ? (
          <div className="flex min-h-56 items-center justify-center border border-dashed border-border px-6 text-center">
            <div><MessageSquareText size={22} className="mx-auto text-muted-foreground" /><p className="mt-4 text-sm font-bold">从一个问题开始</p><p className="mt-2 text-sm leading-7 text-muted-foreground">消息将仅写入独立的 DSH Session，不进入 Asset Hub 正式资产数据。</p></div>
          </div>
        ) : null}
        {conversation.messages.map((message) => <ConversationMessage key={message.id} message={message} />)}
        {conversation.running ? <p className="text-sm font-bold text-muted-foreground">悠鼎 Agent 正在处理...</p> : null}
      </div>

      <form className="mt-6 border-t border-border pt-5" onSubmit={submit}>
        <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="输入给悠鼎 Agent 的消息..." minLength={1} maxLength={8000} className="min-h-[6.5rem]" disabled={sending} />
        <div className="mt-3 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">仅支持文本消息。工具审批与文件成果将在后续阶段独立接入。</p>
          <Button type="submit" disabled={!draft.trim() || sending}>
            {sending ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowUp size={16} />} 发送
          </Button>
        </div>
      </form>
    </div>
  );
}

function ConversationMessage({ message }: { message: AgentConversationMessage }) {
  const isUser = message.role === "user";
  return (
    <article className={`max-w-[48rem] border p-4 ${isUser ? "ml-auto border-foreground bg-foreground text-white" : "border-border bg-[hsl(var(--surface))]"}`}>
      <p className={`text-xs font-bold uppercase tracking-[0.14em] ${isUser ? "text-white/60" : "text-muted-foreground"}`}>{isUser ? "你" : "悠鼎 Agent"}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-7">{message.text}</p>
    </article>
  );
}
