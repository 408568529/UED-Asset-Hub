"use client";

import { FormEvent, useMemo, useState } from "react";
import { CircleHelp, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AgentPendingInteraction, AgentQuestionAnswer } from "@/agent-integration/types";

type AgentInteractionSurfaceProps = {
  interactions: AgentPendingInteraction[];
  onSubmitted: () => void;
  onError: (message: string) => void;
};

async function getError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return body.message || fallback;
}

export function AgentInteractionSurface({ interactions, onSubmitted, onError }: AgentInteractionSurfaceProps) {
  if (interactions.length === 0) return null;

  return (
    <section className="mt-6 border-y border-border py-6" aria-label="需要处理的 Agent 交互">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-primary bg-primary text-foreground"><CircleHelp size={18} /></span>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Action Required</p>
          <h4 className="mt-1 text-lg font-black">需要你的确认或补充</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Agent 会在执行前等待你的回答。提交后，结果会通过 Asset Hub Adapter 回传给本机 DSH。</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {interactions.map((interaction) => interaction.kind === "approval" ? (
          <ApprovalInteraction key={`approval:${interaction.rpcId}`} interaction={interaction} onSubmitted={onSubmitted} onError={onError} />
        ) : (
          <QuestionInteraction key={`question:${interaction.rpcId}`} interaction={interaction} onSubmitted={onSubmitted} onError={onError} />
        ))}
      </div>
    </section>
  );
}

function ApprovalInteraction({ interaction, onSubmitted, onError }: { interaction: Extract<AgentPendingInteraction, { kind: "approval" }>; onSubmitted: () => void; onError: (message: string) => void }) {
  const [submitting, setSubmitting] = useState(false);

  async function answer(outcome: "allowed-once" | "rejected") {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/agent/interactions/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "approval", rpcId: interaction.rpcId, sessionId: interaction.sessionId, approvalId: interaction.approvalId, outcome })
      });
      if (!response.ok) throw new Error(await getError(response, "审批提交失败。"));
      onSubmitted();
    } catch (error) {
      onError(error instanceof Error ? error.message : "审批提交失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="border border-border bg-[hsl(var(--surface))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Tool approval</p>
          <h5 className="mt-2 text-base font-black">允许 Agent 执行 {interaction.toolName}？</h5>
        </div>
        <ShieldCheck size={19} className="text-primary" />
      </div>
      {interaction.reason ? <p className="mt-3 text-sm leading-7 text-muted-foreground">{interaction.reason}</p> : <p className="mt-3 text-sm leading-7 text-muted-foreground">该工具调用需要你明确确认后才会继续。</p>}
      {interaction.callId ? <p className="mt-2 font-mono text-xs text-muted-foreground">调用 {interaction.callId}</p> : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" size="sm" disabled={submitting} onClick={() => void answer("allowed-once")}>{submitting ? <LoaderCircle size={14} className="animate-spin" /> : null} 允许一次</Button>
        <Button type="button" variant="outline" size="sm" disabled={submitting} onClick={() => void answer("rejected")}>拒绝</Button>
      </div>
    </article>
  );
}

function QuestionInteraction({ interaction, onSubmitted, onError }: { interaction: Extract<AgentPendingInteraction, { kind: "question" }>; onSubmitted: () => void; onError: (message: string) => void }) {
  const [answers, setAnswers] = useState<Record<string, { selected: string[]; custom: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const draftAnswers = useMemo(() => interaction.questions.map((question) => ({
    id: question.id,
    selected: answers[question.id]?.selected ?? [],
    custom: answers[question.id]?.custom ?? ""
  })), [answers, interaction.questions]);

  function update(questionId: string, update: Partial<{ selected: string[]; custom: string }>) {
    setAnswers((current) => ({
      ...current,
      [questionId]: { selected: current[questionId]?.selected ?? [], custom: current[questionId]?.custom ?? "", ...update }
    }));
  }

  function toggleOption(questionId: string, option: string, multiSelect: boolean) {
    const current = answers[questionId]?.selected ?? [];
    const selected = multiSelect ? (current.includes(option) ? current.filter((value) => value !== option) : [...current, option]) : [option];
    update(questionId, { selected, ...(multiSelect ? {} : { custom: "" }) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const incomplete = draftAnswers.some((answer) => answer.selected.length === 0 && !answer.custom.trim());
    if (incomplete) return onError("请完成所有待补充问题后再提交。");
    const payload: AgentQuestionAnswer[] = draftAnswers.map((answer) => ({
      id: answer.id,
      selected: answer.selected,
      ...(answer.custom.trim() ? { custom: answer.custom.trim() } : {})
    }));

    setSubmitting(true);
    try {
      const response = await fetch("/api/agent/interactions/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "question", rpcId: interaction.rpcId, sessionId: interaction.sessionId, answers: payload })
      });
      if (!response.ok) throw new Error(await getError(response, "补充信息提交失败。"));
      onSubmitted();
    } catch (error) {
      onError(error instanceof Error ? error.message : "补充信息提交失败。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="border border-border bg-[hsl(var(--surface))] p-5" onSubmit={submit}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{interaction.questions.some((question) => question.intent?.kind === "plan-review") ? "Plan review" : "Agent question"}</p>
      <div className="mt-4 space-y-6">
        {interaction.questions.map((question) => {
          const answer = answers[question.id] ?? { selected: [], custom: "" };
          const allowsCustomAlongsideOptions = question.multiSelect === true;
          return (
            <fieldset key={question.id} className="min-w-0">
              {question.header ? <legend className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{question.header}</legend> : null}
              <p className={question.header ? "mt-2 text-sm font-bold leading-6" : "text-sm font-bold leading-6"}>{question.question}</p>
              {question.detail ? <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{question.detail}</p> : null}
              {question.options?.length ? (
                <div className="mt-3 grid gap-2">
                  {question.options.map((option) => {
                    const active = answer.selected.includes(option.label);
                    return (
                      <button
                        key={option.label}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleOption(question.id, option.label, question.multiSelect === true)}
                        className={`border px-3 py-3 text-left transition-colors ${active ? "border-foreground bg-foreground text-white" : "border-border hover:border-foreground"}`}
                      >
                        <span className="block text-sm font-bold">{option.label}</span>
                        {option.description ? <span className={`mt-1 block text-xs leading-5 ${active ? "text-white/70" : "text-muted-foreground"}`}>{option.description}</span> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {(!question.options?.length || allowsCustomAlongsideOptions || answer.selected.length === 0) ? (
                <Textarea
                  value={answer.custom}
                  onChange={(event) => update(question.id, { custom: event.target.value, ...(question.multiSelect ? {} : { selected: [] }) })}
                  placeholder={question.options?.length ? "或填写其他回答" : "请输入补充信息"}
                  className="mt-3 min-h-[5.5rem]"
                />
              ) : null}
            </fieldset>
          );
        })}
      </div>
      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={submitting}>{submitting ? <LoaderCircle size={15} className="animate-spin" /> : null} 提交回答</Button>
      </div>
    </form>
  );
}
