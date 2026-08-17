import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { agentRuntimeConfig, DSH_VERSION } from "@/agent-integration/config";
import type { AgentConversation, AgentConversationMessage, AgentRuntimeStatus, AgentSession } from "@/agent-integration/types";

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
type DshHistoryEvent = {
  type?: string;
  seq?: number;
  time?: number;
  data?: unknown;
};
type DshHistoryValue = { events: Array<{ event: DshHistoryEvent }> };

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

function getTextContent(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.flatMap((block) => {
    if (!block || typeof block !== "object") return [];
    const record = block as { type?: unknown; text?: unknown };
    return record.type === "text" && typeof record.text === "string" ? [record.text] : [];
  }).join("\n").trim();
}

function toConversationMessage(event: DshHistoryEvent): AgentConversationMessage | null {
  const data = event.data as { id?: unknown; content?: unknown; source?: { kind?: unknown }; message?: { id?: unknown; content?: unknown } } | undefined;
  const message = event.type === "assistant/message" ? data?.message : data;
  const role = event.type === "assistant/message" ? "assistant" : event.type === "user/message" ? "user" : null;
  if (role === "user" && data?.source?.kind !== "user") return null;
  const text = getTextContent(message?.content);
  if (!role || !text) return null;
  const id = typeof message?.id === "string" ? message.id : `${role}-${event.seq ?? randomUUID()}`;
  return {
    id,
    role,
    text,
    createdAt: new Date(typeof event.time === "number" ? event.time : Date.now()).toISOString()
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
  },

  async getConversation(sessionId: string): Promise<AgentConversation> {
    requireCallableRuntime();
    const [history, sessions] = await Promise.all([
      requestDsh<DshHistoryValue>("session.history", { sessionId, maxMessages: 200 }),
      this.listSessions()
    ]);
    const value = requireSuccess(history, "无法读取 DSH 会话历史。");
    return {
      messages: value.events.map(({ event }) => toConversationMessage(event)).filter((message): message is AgentConversationMessage => message !== null),
      running: sessions.find((session) => session.id === sessionId)?.running ?? false
    };
  },

  async sendPrompt(sessionId: string, text: string) {
    requireCallableRuntime();
    const message = text.trim();
    if (!message || message.length > 8000) throw new AgentAdapterError("请输入 1-8000 个字符的消息。");
    requireSuccess(await requestDsh<{ accepted: boolean }>("session.prompt", {
      sessionId,
      mode: "queue",
      content: [{ type: "text", text: message }]
    }), "无法发送消息到 DSH 会话。");
  },

  getEventStream(signal: AbortSignal): ReadableStream<Uint8Array> {
    requireCallableRuntime();
    const streamUrl = new URL("/api/events.mux", agentRuntimeConfig.dshBaseUrl!);
    streamUrl.protocol = streamUrl.protocol === "https:" ? "wss:" : "ws:";
    const encoder = new TextEncoder();
    let socket: WebSocket | null = null;
    let closed = false;

    return new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          if (closed) return;
          closed = true;
          socket?.close();
          controller.close();
        };
        signal.addEventListener("abort", close, { once: true });
        socket = new WebSocket(streamUrl);
        socket.onmessage = (event) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${typeof event.data === "string" ? event.data : ""}\n\n`));
        };
        socket.onerror = () => {
          if (closed) return;
          closed = true;
          controller.error(new AgentAdapterError("无法连接 DSH 实时事件流。"));
        };
        socket.onclose = () => close();
      },
      cancel() {
        socket?.close();
      }
    });
  }
};
