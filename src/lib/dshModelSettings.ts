import "server-only";

import { randomUUID } from "node:crypto";

const DEEPSEEK_PROVIDER = "deepseek-official";
const DEEPSEEK_CREDENTIAL_REF = "DEEPSEEK_API_KEY";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

type RpcEnvelope = { result?: { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } };

export type ModelSettingsStatus = {
  runtime: "ready" | "unavailable";
  provider: "deepseek";
  credential: { configured: boolean; writable: boolean; source?: "env" | "file" | "unknown" };
  baseUrl: string;
  model: string;
  models: { id: string; name: string }[];
};

function dshBaseUrl() {
  const configured = process.env.DSH_BASE_URL?.trim() || "http://127.0.0.1:3080";
  const url = new URL(configured);
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) throw new Error("DSH Runtime 地址必须保持为本机回环地址。");
  return url;
}

async function rpc(method: string, payload: unknown) {
  const baseUrl = dshBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(new URL(`/api/${method}`, baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: baseUrl.origin, Referer: `${baseUrl.origin}/` },
      body: JSON.stringify({ type: "client-request", rpcId: `asset-hub-model-settings-${randomUUID()}`, method, payload }),
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new Error("DSH Runtime 无法响应配置请求。");
    const body = await response.json() as RpcEnvelope;
    if (body.result?.ok !== true) throw new Error(body.result?.error?.message || "DSH Runtime 拒绝了配置请求。");
    return body.result.value;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBaseUrl(value: unknown) {
  const raw = String(value ?? DEFAULT_BASE_URL).trim().replace(/\/$/, "");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) throw new Error("Base URL 必须是有效的 HTTPS 地址。");
  return url.toString().replace(/\/$/, "");
}

function normalizeModel(value: unknown) {
  const model = String(value ?? "").trim();
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(model)) throw new Error("Model 格式无效。");
  return model;
}

function sanitizeCredentialSource(value: unknown): "env" | "file" | "unknown" | undefined {
  return value === "env" || value === "file" ? value : value ? "unknown" : undefined;
}

export async function getModelSettings(): Promise<ModelSettingsStatus> {
  try {
    const [credentialValue, settingsValue, catalogValue] = await Promise.all([
      rpc("credentials.describe", { refs: [DEEPSEEK_CREDENTIAL_REF] }) as Promise<{ credentials?: Record<string, { configured?: boolean; writable?: boolean; source?: unknown }> }>,
      rpc("settings.describe", {}) as Promise<{ namespaces?: { ns?: string; value?: unknown }[] }>,
      rpc("llm.models", {}) as Promise<{ groups?: { id?: string; models?: { id?: string; name?: string }[] }[] }>
    ]);
    const namespaces = settingsValue.namespaces ?? [];
    const deepseek = namespaces.find((item) => item.ns === "llm-deepseek")?.value as { baseURL?: unknown } | undefined;
    const selection = namespaces.find((item) => item.ns === "agent-default-model")?.value as { provider?: unknown; model?: unknown } | undefined;
    const credential = credentialValue.credentials?.[DEEPSEEK_CREDENTIAL_REF];
    const group = catalogValue.groups?.find((item) => item.id === DEEPSEEK_PROVIDER);
    return {
      runtime: "ready",
      provider: "deepseek",
      credential: { configured: credential?.configured === true, writable: credential?.writable === true, source: sanitizeCredentialSource(credential?.source) },
      baseUrl: typeof deepseek?.baseURL === "string" && deepseek.baseURL ? deepseek.baseURL : DEFAULT_BASE_URL,
      model: selection?.provider === DEEPSEEK_PROVIDER && typeof selection.model === "string" ? selection.model : "deepseek-v4-flash",
      models: (group?.models ?? []).flatMap((item) => typeof item.id === "string" ? [{ id: item.id, name: typeof item.name === "string" ? item.name : item.id }] : [])
    };
  } catch {
    return { runtime: "unavailable", provider: "deepseek", credential: { configured: false, writable: false }, baseUrl: DEFAULT_BASE_URL, model: "deepseek-v4-flash", models: [] };
  }
}

export async function saveModelSettings(input: { apiKey?: unknown; baseUrl?: unknown; model?: unknown }) {
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const model = normalizeModel(input.model);
  const current = await getModelSettings();
  if (current.runtime !== "ready") throw new Error("DSH Runtime 未启动，无法保存模型设置。");
  if (!apiKey && !current.credential.configured) throw new Error("请先输入 DeepSeek API Key。");
  await rpc("settings.update", { ns: "llm-deepseek", patch: { baseURL: baseUrl } });
  await rpc("settings.update", { ns: "agent-default-model", patch: { provider: DEEPSEEK_PROVIDER, model } });
  if (apiKey) await rpc("credentials.set", { ref: DEEPSEEK_CREDENTIAL_REF, value: apiKey });
  return getModelSettings();
}

export async function deleteCredential() {
  await rpc("credentials.unset", { ref: DEEPSEEK_CREDENTIAL_REF });
  return getModelSettings();
}

export async function testDeepSeekConnection(input: { apiKey?: unknown; baseUrl?: unknown; model?: unknown }) {
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (!apiKey) throw new Error("测试连接需要输入 API Key；已保存的 Key 不会回读到浏览器。 ");
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const model = normalizeModel(input.model);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 1, stream: false }),
      cache: "no-store",
      signal: controller.signal
    });
    if (response.ok) return { ok: true as const, message: "DeepSeek 连接成功。" };
    if (response.status === 401 || response.status === 403) throw new Error("Credential 验证失败，请检查 API Key。");
    if (response.status === 429) throw new Error("Provider 当前限流，请稍后再试。");
    if (response.status >= 500) throw new Error("Provider 服务暂时不可用，请稍后再试。");
    throw new Error("模型或 Base URL 无法连接，请检查配置。");
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("连接超时，请检查 Base URL 或网络状态。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
