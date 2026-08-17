import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { agentRuntimeConfig, DSH_VERSION } from "@/agent-integration/config";
import type { AgentRuntimeStatus, AgentSession } from "@/agent-integration/types";

type DshRpcResponse<T> = {
  result?: {
    ok?: boolean;
    value?: T;
  };
};

type DshSessionSummary = {
  sessionId: string;
  updatedAt: number;
  running: boolean;
  blank: boolean;
  cwd?: string;
  agentPreset?: string;
  projections?: { values?: { title?: string | null } };
};

type DshListSessionsValue = { items: DshSessionSummary[] };
type DshCreateSessionValue = { sessionId: string };
type DshListWorkspacesValue = { archivedSessionIds: string[] };

export class AgentAdapterError extends Error {}

function requireCallableRuntime() {
  if (!agentRuntimeConfig.enabled) throw new AgentAdapterError("悠鼎 Agent 已被当前服务器配置禁用。");
  if (!agentRuntimeConfig.dshBaseUrl) throw new AgentAdapterError("DSH_BASE_URL 必须是本机回环地址。");
}

function requireWorkspacePath() {
  if (!agentRuntimeConfig.workspacePath) throw new AgentAdapterError("缺少 AGENT_RUNTIME_DIR，无法创建独立工作目录。");
  const relative = path.relative(process.cwd(), path.resolve(agentRuntimeConfig.workspacePath));
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..")) throw new AgentAdapterError("AGENT_RUNTIME_DIR 必须位于 Git 代码目录外。");
  return agentRuntimeConfig.workspacePath;
}

function unavailable(message: string): AgentRuntimeStatus {
  return {
    state: "unavailable",
    message,
    checkedAt: new Date().toISOString(),
    runtimeVersion: DSH_VERSION
  };
}

async function requestDsh<T>(method: string, payload: Record<string, unknown>) {
  if (!agentRuntimeConfig.dshBaseUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(new URL(`/api/${method}`, agentRuntimeConfig.dshBaseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: randomUUID(),
        method,
        payload
      }),
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) return null;
    return await response.json() as DshRpcResponse<T>;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function requireSuccess<T>(response: DshRpcResponse<T> | null, fallbackMessage: string) {
  if (response?.result?.ok === true && response.result.value !== undefined) return response.result.value;
  throw new AgentAdapterError(fallbackMessage);
}

function toAgentSession(item: DshSessionSummary): AgentSession {
  return {
    id: item.sessionId,
    title: item.projections?.values?.title ?? null,
    updatedAt: new Date(item.updatedAt).toISOString(),
    running: item.running,
    blank: item.blank,
    agentPreset: item.agentPreset,
    workspacePath: item.cwd
  };
}

export const dshRuntimeAdapter = {
  async getStatus(): Promise<AgentRuntimeStatus> {
    if (!agentRuntimeConfig.enabled) {
      return {
        state: "disabled",
        message: "悠鼎 Agent 已被当前服务器配置禁用。",
        checkedAt: new Date().toISOString(),
        runtimeVersion: DSH_VERSION
      };
    }

    if (!agentRuntimeConfig.dshBaseUrl) {
      return {
        state: "misconfigured",
        message: "DSH_BASE_URL 必须是本机 127.0.0.1、localhost 或 ::1 地址。",
        checkedAt: new Date().toISOString(),
        runtimeVersion: DSH_VERSION
      };
    }

    const result = await requestDsh<DshListSessionsValue>("session.list", {});
    if (result?.result?.ok !== true) return unavailable("DSH 运行时未启动或尚未就绪。请在服务器启动固定版本的 DSH。");

    return {
      state: "ready",
      message: "DSH 运行时已通过 Asset Hub Adapter 连接。",
      checkedAt: new Date().toISOString(),
      runtimeVersion: DSH_VERSION
    };
  },

  async listSessions(): Promise<AgentSession[]> {
    requireCallableRuntime();
    const [sessions, workspaces] = await Promise.all([
      requestDsh<DshListSessionsValue>("session.list", {}),
      requestDsh<DshListWorkspacesValue>("workspace.list", {})
    ]);
    const sessionValue = requireSuccess(sessions, "无法读取 DSH 会话列表。");
    const workspaceValue = requireSuccess(workspaces, "无法读取 DSH 工作区归档状态。");
    const archivedIds = new Set(workspaceValue.archivedSessionIds);
    return sessionValue.items.filter((item) => !archivedIds.has(item.sessionId)).map(toAgentSession).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  },

  async createSession(): Promise<AgentSession> {
    requireCallableRuntime();
    const workspacePath = requireWorkspacePath();
    await mkdir(workspacePath, { recursive: true });
    const value = requireSuccess(await requestDsh<DshCreateSessionValue>("session.create", { cwd: workspacePath }), "无法创建 DSH 会话。");
    const session = (await this.listSessions()).find((item) => item.id === value.sessionId);
    if (!session) throw new AgentAdapterError("DSH 已创建会话，但未能读取会话信息。");
    return session;
  },

  async renameSession(sessionId: string, title: string) {
    requireCallableRuntime();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) throw new AgentAdapterError("会话名称不能为空。");
    requireSuccess(await requestDsh<{ title: string }>("session.rename", { sessionId, title: normalizedTitle }), "无法重命名 DSH 会话。");
  },

  async archiveSession(sessionId: string) {
    requireCallableRuntime();
    requireSuccess(await requestDsh<{ archivedSessionIds: string[] }>("workspace.archiveSession", { sessionId }), "无法归档 DSH 会话。");
  }
};
