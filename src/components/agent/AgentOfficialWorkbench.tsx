"use client";

import { useEffect, useState } from "react";

type WorkbenchState =
  | { status: "loading"; url: null }
  | { status: "ready"; url: string }
  | { status: "error"; url: null };

export function AgentOfficialWorkbench() {
  const [state, setState] = useState<WorkbenchState>({ status: "loading", url: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent/workbench", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("无法建立悠鼎 Agent 工作台连接。");
        return response.json() as Promise<{ url?: string }>;
      })
      .then((payload) => {
        if (!cancelled && payload.url) setState({ status: "ready", url: payload.url });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", url: null });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.status === "error") {
    return <main className="grid min-h-[calc(100dvh-4.5rem)] place-items-center bg-[#101216] p-8 text-sm text-white/65">无法加载官方 DSH 工作台。请确认 Host Runner 已启动。</main>;
  }

  if (!state.url) {
    return <main className="grid min-h-[calc(100dvh-4.5rem)] place-items-center bg-[#101216] p-8 text-sm text-white/65">正在加载官方 DSH 工作台...</main>;
  }

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[#101216]">
      <iframe title="悠鼎 Agent 工作台" src={state.url} className="block min-h-[calc(100dvh-4.5rem)] w-full border-0 bg-[#101216]" />
    </main>
  );
}
