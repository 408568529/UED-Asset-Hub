"use client";

import { useCallback, useEffect, useState } from "react";

type WorkbenchState =
  | { status: "loading"; url: null }
  | { status: "ready"; url: string }
  | { status: "error"; url: null };

export function AgentOfficialWorkbench() {
  const [state, setState] = useState<WorkbenchState>({ status: "loading", url: null });
  const [frameKey, setFrameKey] = useState(0);

  const loadWorkbench = useCallback(() => {
    let cancelled = false;
    setState({ status: "loading", url: null });
    Promise.all([
      fetch("/api/agent/workbench", { cache: "no-store" }),
      fetch("/agent-runtime/healthz", { cache: "no-store" })
    ])
      .then(async (response) => {
        const [workbenchResponse, healthResponse] = response;
        if (!workbenchResponse.ok || !healthResponse.ok) throw new Error("无法建立悠鼎 Agent 工作台连接。");
        return workbenchResponse.json() as Promise<{ url?: string }>;
      })
      .then((payload) => {
        if (!cancelled && payload.url) setState({ status: "ready", url: payload.url });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", url: null });
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => loadWorkbench(), [loadWorkbench]);

  useEffect(() => {
    if (state.status !== "ready") return;
    const interval = window.setInterval(() => {
      fetch("/agent-runtime/healthz", { cache: "no-store" })
        .then((response) => {
          if (!response.ok) setState({ status: "error", url: null });
        })
        .catch(() => setState({ status: "error", url: null }));
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [state.status]);

  if (state.status === "error") {
    return (
      <main className="grid min-h-[calc(100dvh-4.5rem)] place-items-center bg-[#101216] p-8 text-sm text-white/65">
        <div className="max-w-md space-y-3 border border-white/15 bg-white/[0.03] p-6">
          <p className="text-base font-medium text-white">悠鼎 Agent 暂时不可用</p>
          <p>请确认 Host Runner 正在运行，DSH Runtime 将在恢复后自动重新连接。</p>
          <button type="button" onClick={() => { setFrameKey((value) => value + 1); loadWorkbench(); }} className="border border-white/30 px-3 py-2 text-sm text-white transition hover:border-lime-300 hover:text-lime-200">重新连接</button>
        </div>
      </main>
    );
  }

  if (!state.url) {
    return <main className="grid min-h-[calc(100dvh-4.5rem)] place-items-center bg-[#101216] p-8 text-sm text-white/65">正在加载官方 DSH 工作台...</main>;
  }

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#101216]">
      <iframe key={frameKey} title="悠鼎 Agent 工作台" src={state.url} className="block min-h-[calc(100dvh-4.5rem)] w-full border-0 bg-[#101216]" />
    </main>
  );
}
