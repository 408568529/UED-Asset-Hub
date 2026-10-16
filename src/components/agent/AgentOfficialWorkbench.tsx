"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type RuntimeState = {
  status: "unavailable" | "starting" | "shutting_down" | "ready" | "configuration_required" | "error";
  phase: string | null;
  reasonCode: string | null;
  generation: number;
  credentialStatus: "configured" | "missing" | "unknown";
  retryable: boolean;
};

type WorkbenchState =
  | { status: "loading" }
  | { status: "ready"; url: string; generation: number }
  | { status: "starting"; runtime: RuntimeState | null }
  | { status: "reconnecting"; url: string; generation: number }
  | { status: "error"; kind: "agent-unavailable" | "runtime-action" | "runtime-waiting" | "runtime-admin" | "status-failed" | "configuration-required"; runtime: RuntimeState | null };

type RequestScope = { sequence: number; controller: AbortController };
type CachedWorkbench = { url: string; generation: number; checkedAt: number };

let cachedWorkbench: CachedWorkbench | null = null;

const runtimeStatuses = new Set<RuntimeState["status"]>(["unavailable", "starting", "shutting_down", "ready", "configuration_required", "error"]);
const credentialStatuses = new Set<RuntimeState["credentialStatus"]>(["configured", "missing", "unknown"]);

function isRuntimeState(value: unknown): value is RuntimeState {
  if (!value || typeof value !== "object") return false;
  const runtime = value as Partial<RuntimeState>;
  return runtimeStatuses.has(runtime.status as RuntimeState["status"])
    && credentialStatuses.has(runtime.credentialStatus as RuntimeState["credentialStatus"])
    && typeof runtime.generation === "number"
    && typeof runtime.retryable === "boolean";
}

function isWorkbenchUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  const url = new URL(value, window.location.origin);
  return url.origin === window.location.origin && (url.pathname === "/agent-runtime" || url.pathname.startsWith("/agent-runtime/"));
}

function configurationMessage(runtime: RuntimeState) {
  switch (runtime.reasonCode) {
    case "credential_missing":
      return "模型 Credential 尚未配置。请先前往模型设置完成配置。";
    case "agent_configuration_invalid":
      return "Agent 模型配置无效。请前往模型设置检查 Provider、Base URL 与模型选择。";
    case "build_missing":
    case "build_invalid":
      return "DSH Runtime 构建不可用。请由主机管理员检查正式运行配置。";
    case "source_invalid":
      return "DSH Source 校验未通过。请由主机管理员检查正式运行配置。";
    case "runtime_configuration_invalid":
      return "Agent Runtime 配置不完整。请由主机管理员检查 Host Runner 配置。";
    default:
      return "Agent Runtime 需要完成配置后才能启动。";
  }
}

export function AgentOfficialWorkbench({ canManage = false }: { canManage?: boolean }) {
  const initialCache = useRef<CachedWorkbench | null>(cachedWorkbench && Date.now() - cachedWorkbench.checkedAt < 60_000 ? cachedWorkbench : null);
  const [state, setState] = useState<WorkbenchState>(() => initialCache.current ? { status: "ready", url: initialCache.current.url, generation: initialCache.current.generation } : { status: "loading" });
  const [frameKey, setFrameKey] = useState(0);
  const mountedRef = useRef(false);
  const actionLockRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const frameLoadTimerRef = useRef<number | null>(null);
  const frameSequenceRef = useRef(0);

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
    pollTimerRef.current = null;
  }, []);

  const clearFrameLoadTimer = useCallback(() => {
    if (frameLoadTimerRef.current !== null) window.clearTimeout(frameLoadTimerRef.current);
    frameLoadTimerRef.current = null;
  }, []);

  const isCurrent = useCallback((scope: RequestScope) => mountedRef.current && requestSequenceRef.current === scope.sequence && !scope.controller.signal.aborted, []);

  const beginRequestScope = useCallback((): RequestScope => {
    requestSequenceRef.current += 1;
    requestControllerRef.current?.abort();
    clearPollTimer();
    clearFrameLoadTimer();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    return { sequence: requestSequenceRef.current, controller };
  }, [clearFrameLoadTimer, clearPollTimer]);

  const requestRuntimeStatus = useCallback(async (signal: AbortSignal) => {
    const response = await fetch("/api/runtime/status", { cache: "no-store", signal });
    const payload = await response.json().catch(() => null) as { runtime?: unknown } | null;
    if (!response.ok || !isRuntimeState(payload?.runtime)) throw new Error("无法读取 Agent Runtime 状态。");
    return payload.runtime;
  }, []);

  const reconnectWorkbench = useCallback(async (scope: RequestScope, runtime: RuntimeState) => {
    try {
      const [workbenchResponse, healthResponse] = await Promise.all([
        fetch("/api/agent/workbench", { cache: "no-store", signal: scope.controller.signal }),
        fetch("/agent-runtime/healthz", { cache: "no-store", signal: scope.controller.signal })
      ]);
      if (!workbenchResponse.ok || !healthResponse.ok) throw new Error("无法建立悠鼎 Agent 工作台连接。");
      const payload = await workbenchResponse.json() as { url?: unknown };
      if (!isWorkbenchUrl(payload.url)) throw new Error("Agent 工作台地址无效。");
      if (!isCurrent(scope)) return;
      setFrameKey((value) => value + 1);
      frameSequenceRef.current = scope.sequence;
      cachedWorkbench = null;
      setState({ status: "reconnecting", url: payload.url, generation: runtime.generation });
      frameLoadTimerRef.current = window.setTimeout(() => {
        if (!isCurrent(scope)) return;
        actionLockRef.current = false;
        setState({ status: "error", kind: "agent-unavailable", runtime: null });
      }, 45_000);
    } catch {
      if (!isCurrent(scope)) return;
      actionLockRef.current = false;
      setState({ status: "error", kind: "agent-unavailable", runtime: null });
    }
  }, [isCurrent]);

  const resolveRuntimeState = useCallback(async function resolveRuntimeState(scope: RequestScope, runtime: RuntimeState) {
    if (!isCurrent(scope)) return;
    if (runtime.status === "ready") {
      clearPollTimer();
      actionLockRef.current = false;
      await reconnectWorkbench(scope, runtime);
      return;
    }

    cachedWorkbench = null;
    if (runtime.status === "starting") {
      setState({ status: "starting", runtime });
      clearPollTimer();
      pollTimerRef.current = window.setTimeout(async () => {
        if (!isCurrent(scope)) return;
        try {
          const nextRuntime = await requestRuntimeStatus(scope.controller.signal);
          await resolveRuntimeState(scope, nextRuntime);
        } catch {
          if (!isCurrent(scope)) return;
          actionLockRef.current = false;
          setState({ status: "error", kind: "status-failed", runtime: null });
        }
      }, 1_000);
      return;
    }

    clearPollTimer();
    actionLockRef.current = false;
    if (runtime.status === "configuration_required") {
      setState({ status: "error", kind: "configuration-required", runtime });
      return;
    }
    if (runtime.retryable) {
      setState({ status: "error", kind: "runtime-action", runtime });
      return;
    }
    setState({ status: "error", kind: runtime.status === "unavailable" ? "runtime-waiting" : "runtime-admin", runtime });
  }, [clearPollTimer, isCurrent, reconnectWorkbench, requestRuntimeStatus]);

  const refreshRuntimeStatus = useCallback((background = false) => {
    const previous = cachedWorkbench;
    const scope = beginRequestScope();
    if (!background) {
      cachedWorkbench = null;
      setState({ status: "loading" });
    }
    void (async () => {
      try {
        const runtime = await requestRuntimeStatus(scope.controller.signal);
        if (background && runtime.status === "ready" && previous && runtime.generation === previous.generation) {
          const [workbenchResponse, healthResponse] = await Promise.all([
            fetch("/api/agent/workbench", { cache: "no-store", signal: scope.controller.signal }),
            fetch("/agent-runtime/healthz", { cache: "no-store", signal: scope.controller.signal })
          ]);
          const payload = await workbenchResponse.json().catch(() => null) as { url?: unknown } | null;
          if (workbenchResponse.ok && healthResponse.ok && isWorkbenchUrl(payload?.url) && payload.url === previous.url && isCurrent(scope)) {
            cachedWorkbench = { ...previous, checkedAt: Date.now() };
            setState({ status: "ready", url: previous.url, generation: previous.generation });
            return;
          }
        }
        if (background) cachedWorkbench = null;
        await resolveRuntimeState(scope, runtime);
      } catch {
        if (!isCurrent(scope)) return;
        cachedWorkbench = null;
        actionLockRef.current = false;
        setState({ status: "error", kind: "status-failed", runtime: null });
      }
    })();
  }, [beginRequestScope, isCurrent, requestRuntimeStatus, resolveRuntimeState]);

  const startRuntime = useCallback(() => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    cachedWorkbench = null;
    const scope = beginRequestScope();
    setState({ status: "starting", runtime: null });
    void (async () => {
      try {
        const response = await fetch("/api/runtime/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
          signal: scope.controller.signal
        });
        if ([400, 401, 403].includes(response.status)) {
          if (!isCurrent(scope)) return;
          actionLockRef.current = false;
          setState({ status: "error", kind: "runtime-admin", runtime: null });
          return;
        }
      } catch {
        if (!isCurrent(scope)) return;
        // The request may have reached the Supervisor before its transport failed.
      }
      if (!isCurrent(scope)) return;
      try {
        const runtime = await requestRuntimeStatus(scope.controller.signal);
        await resolveRuntimeState(scope, runtime);
      } catch {
        if (!isCurrent(scope)) return;
        actionLockRef.current = false;
        setState({ status: "error", kind: "status-failed", runtime: null });
      }
    })();
  }, [beginRequestScope, isCurrent, requestRuntimeStatus, resolveRuntimeState]);

  useEffect(() => {
    mountedRef.current = true;
    refreshRuntimeStatus(initialCache.current !== null);
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      requestControllerRef.current?.abort();
      clearPollTimer();
      clearFrameLoadTimer();
    };
  }, [clearFrameLoadTimer, clearPollTimer, refreshRuntimeStatus]);

  const readyGeneration = state.status === "ready" ? state.generation : null;

  useEffect(() => {
    if (state.status !== "ready") return;
    let disposed = false;
    let controller: AbortController | null = null;
    let timer: number | null = null;
    const checkHealth = async () => {
      controller = new AbortController();
      try {
        const response = await fetch("/agent-runtime/healthz", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Agent Proxy is unavailable.");
      } catch {
        if (!disposed && !controller.signal.aborted) {
          cachedWorkbench = null;
          setState({ status: "error", kind: "agent-unavailable", runtime: null });
        }
        return;
      }
      if (!disposed) {
        if (cachedWorkbench && readyGeneration !== null && cachedWorkbench.generation === readyGeneration) cachedWorkbench = { ...cachedWorkbench, checkedAt: Date.now() };
        timer = window.setTimeout(checkHealth, 15_000);
      }
    };
    timer = window.setTimeout(checkHealth, 15_000);
    return () => {
      disposed = true;
      controller?.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [state.status, readyGeneration]);

  const handleFrameLoad = () => {
    if (!mountedRef.current || frameSequenceRef.current !== requestSequenceRef.current || requestControllerRef.current?.signal.aborted) return;
    clearFrameLoadTimer();
    setState((current) => {
      if (current.status !== "reconnecting") return current;
      cachedWorkbench = { url: current.url, generation: current.generation, checkedAt: Date.now() };
      return { status: "ready", url: current.url, generation: current.generation };
    });
  };

  if (state.status === "starting") {
    return <main className="agent-runtime-status grid min-h-0 flex-1 place-items-center bg-[#101216] p-8 text-sm text-white/65">正在启动 Agent Runtime{state.runtime?.phase ? `：${state.runtime.phase}` : "…"}</main>;
  }

  if (state.status === "loading") {
    return <main className="agent-runtime-status grid min-h-0 flex-1 place-items-center bg-[#101216] p-8 text-sm text-white/65">正在检查 Agent Runtime…</main>;
  }

  if (state.status === "error") {
    const configurationRequired = state.kind === "configuration-required";
    const modelSettingsRequired = configurationRequired && (state.runtime?.reasonCode === "credential_missing" || state.runtime?.reasonCode === "agent_configuration_invalid");
    const recoveryAction = state.kind === "runtime-action" && (state.runtime?.reasonCode === "recovery_failed" || state.runtime?.reasonCode === "runtime_degraded");
    const actionLabel = recoveryAction ? "恢复 Agent" : state.runtime?.status === "unavailable" ? "启动 Agent" : "重试启动 Agent";
    const title = state.kind === "status-failed" ? "无法读取 Agent Runtime 状态" : configurationRequired ? "Agent Runtime 需要配置" : state.kind === "runtime-admin" ? "Agent Runtime 需要管理员处理" : "悠鼎 Agent 暂时不可用";
    const message = state.kind === "status-failed"
      ? "Runtime Control 当前不可用。请确认 Host Runner 正在运行后重新检查。"
      : configurationRequired && state.runtime
        ? configurationMessage(state.runtime)
        : state.kind === "agent-unavailable"
          ? "Agent Runtime 已就绪，但官方工作台暂时无法连接。"
          : state.kind === "runtime-waiting"
            ? "Agent Runtime 正在等待 Host Supervisor 自动启动。请稍候或重新检查状态。"
            : state.kind === "runtime-admin"
              ? "当前 Runtime 状态不能由浏览器安全恢复。请由主机管理员检查运行配置与受管服务。"
              : "Agent Runtime 未能恢复。可以再次执行受管恢复。";
    return (
      <main className="agent-runtime-status grid min-h-0 flex-1 place-items-center bg-[#101216] p-8 text-sm text-white/65">
        <div className="agent-runtime-status-card max-w-md space-y-3 border border-white/15 bg-white/[0.03] p-6">
          <p className="text-base font-medium text-white">{title}</p>
          <p>{message}</p>
          <div className="flex flex-wrap gap-3">
            {canManage && modelSettingsRequired ? <Link href="/agent/settings" className="border border-white/30 px-3 py-2 text-sm text-white transition hover:border-lime-300 hover:text-lime-200">前往模型设置</Link> : null}
            {state.kind === "agent-unavailable" ? <button type="button" onClick={() => refreshRuntimeStatus()} className="border border-white/30 px-3 py-2 text-sm text-white transition hover:border-lime-300 hover:text-lime-200">重新连接</button> : null}
            {canManage && state.kind === "runtime-action" ? <button type="button" onClick={startRuntime} className="border border-white/30 px-3 py-2 text-sm text-white transition hover:border-lime-300 hover:text-lime-200">{actionLabel}</button> : null}
            {state.kind === "status-failed" || configurationRequired || state.kind === "runtime-waiting" || state.kind === "runtime-admin" ? <button type="button" onClick={() => refreshRuntimeStatus()} className="border border-white/30 px-3 py-2 text-sm text-white transition hover:border-lime-300 hover:text-lime-200">重新检查</button> : null}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-0 flex-1 flex-col bg-[#101216]">
      {state.status === "reconnecting" ? <div className="agent-runtime-status absolute inset-0 z-10 grid place-items-center bg-[#101216] p-8 text-sm text-white/65">正在重新连接官方 DSH 工作台…</div> : null}
      <iframe key={frameKey} title="悠鼎 Agent 工作台" src={state.url} onLoad={handleFrameLoad} className="block h-full min-h-0 w-full flex-1 border-0 bg-[#101216]" />
    </main>
  );
}
