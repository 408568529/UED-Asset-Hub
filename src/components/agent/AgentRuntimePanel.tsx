"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentRuntimeStatus } from "@/agent-integration/types";

const stateLabel: Record<AgentRuntimeStatus["state"], string> = {
  ready: "已连接",
  unavailable: "未启动",
  misconfigured: "配置异常",
  disabled: "已禁用"
};

export function AgentRuntimePanel() {
  const [status, setStatus] = useState<AgentRuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/agent/health", { cache: "no-store" });
      setStatus(response.ok ? await response.json() as AgentRuntimeStatus : null);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const ready = status?.state === "ready";

  return (
    <section className="border-y border-border bg-[hsl(var(--surface))]">
      <div className="grid gap-8 px-5 py-8 md:grid-cols-[1fr_auto] md:items-end md:px-8">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            {ready ? <ShieldCheck size={15} className="text-primary" /> : <CircleAlert size={15} />}
            Runtime status
          </div>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <h2 className="text-2xl font-black">{loading ? "正在检查运行时" : stateLabel[status?.state ?? "unavailable"]}</h2>
            {status ? <span className="font-mono text-xs text-muted-foreground">DSH {status.runtimeVersion}</span> : null}
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{loading ? "Asset Hub 正在通过服务端 Adapter 检查本机 DSH。" : status?.message ?? "无法读取 Agent 运行状态。"}</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : undefined} />
          刷新状态
        </Button>
      </div>
    </section>
  );
}
