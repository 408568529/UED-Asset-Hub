import "server-only";
import { randomUUID } from "node:crypto";
import { agentRuntimeConfig, DSH_VERSION } from "@/agent-integration/config";
import type { AgentRuntimeStatus } from "@/agent-integration/types";

type DshRpcResponse = {
  result?: {
    ok?: boolean;
  };
};

function unavailable(message: string): AgentRuntimeStatus {
  return {
    state: "unavailable",
    message,
    checkedAt: new Date().toISOString(),
    runtimeVersion: DSH_VERSION
  };
}

async function requestDsh(method: string, payload: Record<string, never>) {
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
    return await response.json() as DshRpcResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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

    const result = await requestDsh("session.list", {});
    if (result?.result?.ok !== true) return unavailable("DSH 运行时未启动或尚未就绪。请在服务器启动固定版本的 DSH。");

    return {
      state: "ready",
      message: "DSH 运行时已通过 Asset Hub Adapter 连接。",
      checkedAt: new Date().toISOString(),
      runtimeVersion: DSH_VERSION
    };
  }
};
