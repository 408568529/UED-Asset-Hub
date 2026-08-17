"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentConversation, AgentConversationMessage, AgentInteractionEvent, AgentQuestion, AgentSession } from "@/agent-integration/types";

type AgentConversationSurfaceProps = {
  session: AgentSession;
  onSessionActivity: () => void;
  onError: (message: string) => void;
  onInteraction: (event: AgentInteractionEvent) => void;
};

type DshEventEnvelope = {
  rpcId?: unknown;
  payload?: {
    type?: unknown;
    sessionId?: unknown;
    approvalId?: unknown;
    toolName?: unknown;
    callId?: unknown;
    reason?: unknown;
    questionRpcId?: unknown;
    questions?: unknown;
  };
};

async function getError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return body.message || fallback;
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function toQuestions(value: unknown): AgentQuestion[] | null {
  if (!Array.isArray(value)) return null;
  const questions = value.map((item) => {
    if (!item || typeof item !== "object") return null;
    const question = item as Record<string, unknown>;
    const id = asText(question.id);
    const text = asText(question.question);
    if (!id || !text) return null;
    const options = Array.isArray(question.options) ? question.options.flatMap((option) => {
      if (!option || typeof option !== "object") return [];
      const optionValue = option as Record<string, unknown>;
      const label = asText(optionValue.label);
      return label ? [{ label, ...(asText(optionValue.description) ? { description: asText(optionValue.description)! } : {}) }] : [];
    }) : undefined;
    const intent = question.intent && typeof question.intent === "object" ? question.intent as Record<string, unknown> : null;
    const approve = intent ? asText(intent.approve) : null;
    return {
      id,
      question: text,
      ...(asText(question.detail) ? { detail: asText(question.detail)! } : {}),
      ...(asText(question.header) ? { header: asText(question.header)! } : {}),
      ...(options?.length ? { options } : {}),
      ...(question.multiSelect === true ? { multiSelect: true } : {}),
      ...(intent?.kind === "plan-review" && approve ? { intent: { kind: "plan-review" as const, approve } } : {})
    };
  });
  return questions.every((question): question is AgentQuestion => question !== null) ? questions : null;
}

function toInteractionEvent(envelope: DshEventEnvelope): AgentInteractionEvent | null {
  const payload = envelope.payload;
  const type = asText(payload?.type);
  const sessionId = asText(payload?.sessionId);
  if (!type || !sessionId) return null;

  if (type === "approval/requested") {
    const rpcId = asText(envelope.rpcId);
    const approvalId = asText(payload?.approvalId);
    const toolName = asText(payload?.toolName);
    if (!rpcId || !approvalId || !toolName) return null;
    return { type: "requested", interaction: { kind: "approval", rpcId, sessionId, approvalId, toolName, ...(asText(payload?.callId) ? { callId: asText(payload?.callId)! } : {}), ...(asText(payload?.reason) ? { reason: asText(payload?.reason)! } : {}) } };
  }
  if (type === "question/requested") {
    const rpcId = asText(envelope.rpcId);
    const questions = toQuestions(payload?.questions);
    if (!rpcId || !questions) return null;
    return { type: "requested", interaction: { kind: "question", rpcId, sessionId, questions } };
  }
  if (type === "approval/resolved") {
    const approvalId = asText(payload?.approvalId);
    return approvalId ? { type: "approval-resolved", sessionId, approvalId } : null;
  }
  if (type === "question/resolved") {
    const rpcId = asText(payload?.questionRpcId);
    return rpcId ? { type: "question-resolved", sessionId, rpcId } : null;
  }
  return null;
}

export function AgentConversationSurface({ session, onSessionActivity, onError, onInteraction }: AgentConversationSurfaceProps) {
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
        const envelope = JSON.parse(event.data) as DshEventEnvelope;
        const frame = envelope.payload;
        if (frame?.type === "session/event" && frame.sessionId === session.id) scheduleRefresh();
        const interaction = toInteractionEvent(envelope);
        if (interaction) onInteraction(interaction);
      } catch {
        // Ignore malformed upstream frames; the next valid DSH event re-syncs history.
      }
    };

    return () => {
      stream.close();
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [onInteraction, onSessionActivity, refresh, session.id]);

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
          <p className="text-xs text-muted-foreground">仅支持文本消息。需要确认、审批或补充信息时，会显示在本会话上方。</p>
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
