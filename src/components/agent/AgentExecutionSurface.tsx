"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import type { AgentExecutionSnapshot, AgentSession } from "@/agent-integration/types";

type AgentExecutionSurfaceProps = {
  session: AgentSession;
  onError: (message: string) => void;
  refreshKey: number;
};

async function getError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { message?: string };
  return body.message || fallback;
}

function statusLabel(status: AgentExecutionSnapshot["activities"][number]["status"]) {
  return status === "running" ? "执行中" : status === "completed" ? "已完成" : "失败";
}

export function AgentExecutionSurface({ session, onError, refreshKey }: AgentExecutionSurfaceProps) {
  const [snapshot, setSnapshot] = useState<AgentExecutionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/agent/sessions/${encodeURIComponent(session.id)}/execution`, { cache: "no-store" });
      if (!response.ok) throw new Error(await getError(response, "无法读取执行过程。"));
      setSnapshot(await response.json() as AgentExecutionSnapshot);
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法读取执行过程。");
    } finally {
      setLoading(false);
    }
  }, [onError, session.id]);

  useEffect(() => {
    setLoading(true);
    setSnapshot(null);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (refreshKey > 0) void refresh();
  }, [refresh, refreshKey]);

  return (
    <section className="mt-8 border-t border-border pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Execution Surface</p>
          <h4 className="mt-2 text-lg font-black">工具与 Skill</h4>
        </div>
        <p className="text-sm font-bold text-muted-foreground">{snapshot?.running ? "Agent 正在运行" : "会话空闲"}</p>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="border-y border-border">
          {loading ? <p className="py-5 text-sm text-muted-foreground">正在读取执行过程...</p> : null}
          {!loading && snapshot?.activities.length === 0 ? <p className="py-5 text-sm leading-7 text-muted-foreground">尚无工具调用。Agent 调用文件、搜索、终端或 Skill 工具后，会在这里显示执行状态。</p> : null}
          {snapshot?.activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 border-b border-border py-4 last:border-b-0">
              <ExecutionStatus status={activity.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="text-sm font-bold">{activity.title}</p><span className="font-mono text-xs text-muted-foreground">{activity.toolName}</span></div>
                {activity.detail ? <p className="mt-1 truncate text-xs leading-6 text-muted-foreground" title={activity.detail}>{activity.detail}</p> : null}
                {activity.error ? <p className="mt-1 text-xs font-bold text-destructive">{activity.error}</p> : null}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{statusLabel(activity.status)}</span>
            </div>
          ))}
        </div>

        <div className="border-l border-border pl-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Available Skills</p>
          <div className="mt-3 space-y-3">
            {loading ? <p className="text-sm text-muted-foreground">读取中...</p> : null}
            {!loading && snapshot?.skills.length === 0 ? <p className="text-sm leading-6 text-muted-foreground">当前工作区没有可调用 Skill。</p> : null}
            {snapshot?.skills.map((skill) => (
              <div key={skill.name} className="border-l-2 border-primary pl-3">
                <p className="font-mono text-xs font-bold">/{skill.name}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{skill.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ExecutionStatus({ status }: { status: AgentExecutionSnapshot["activities"][number]["status"] }) {
  if (status === "running") return <LoaderCircle size={16} className="mt-0.5 shrink-0 animate-spin text-primary" />;
  if (status === "failed") return <CircleAlert size={16} className="mt-0.5 shrink-0 text-destructive" />;
  return <Check size={16} className="mt-0.5 shrink-0 text-primary" />;
}
