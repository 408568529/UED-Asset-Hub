"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Settings = {
  runtime: "ready" | "unavailable";
  provider: "deepseek";
  credential: { configured: boolean; writable: boolean; source?: "env" | "file" | "unknown" };
  baseUrl: string;
  model: string;
  models: { id: string; name: string }[];
};

const initial: Settings = { runtime: "unavailable", provider: "deepseek", credential: { configured: false, writable: false }, baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", models: [] };

export function AgentModelSettings() {
  const [settings, setSettings] = useState<Settings>(initial);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl);
  const [model, setModel] = useState(initial.model);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);

  async function load() {
    const response = await fetch("/api/agent/model-settings", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取模型设置。");
    const next = await response.json() as Settings;
    setSettings(next);
    setBaseUrl(next.baseUrl);
    setModel(next.model);
  }

  useEffect(() => { void load().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "无法读取模型设置。")); }, []);

  async function submit(action: "save" | "test" | "delete") {
    if (action === "delete" && !window.confirm("删除 DeepSeek Credential 后，新的 Agent 请求将无法调用模型。确定继续吗？")) return;
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/agent/model-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, apiKey: action === "delete" ? undefined : apiKey, baseUrl, model })
      });
      const payload = await response.json() as Settings & { message?: string };
      if (!response.ok) throw new Error(payload.message || "模型设置请求失败。 ");
      if (action === "test") setMessage(payload.message || "连接成功。");
      else {
        setSettings(payload);
        setBaseUrl(payload.baseUrl);
        setModel(payload.model);
        setApiKey("");
        setMessage(action === "delete" ? "Credential 已删除。" : "模型设置已保存，新的 Agent Session 将使用此模型。 ");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模型设置请求失败。 ");
    } finally {
      setBusy(null);
    }
  }

  const canWrite = settings.runtime === "ready" && settings.credential.writable;
  return (
    <section className="mx-auto w-full max-w-2xl space-y-6 p-6 sm:p-10">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">悠鼎 Agent</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.03em]">模型设置</h1>
        <p className="mt-2 text-sm text-muted-foreground">Credential 仅保存至隔离 DSH Runtime；已保存的 API Key 不会回读或写入资产数据。</p>
      </div>
      <div className="space-y-5 border border-border bg-[hsl(var(--surface))] p-5 sm:p-7">
        <label className="block space-y-2 text-sm font-bold"><span>Provider</span><Input value="DeepSeek" disabled /></label>
        <label className="block space-y-2 text-sm font-bold">
          <span>API Key</span>
          <Input type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={settings.credential.configured ? "••••••••••••  已配置；更新时请输入完整新 Key" : "请输入 API Key"} disabled={!canWrite || busy !== null} />
          <span className="block text-xs font-normal text-muted-foreground">{settings.credential.configured ? `已配置${settings.credential.source === "env" ? "（环境注入，无法在页面覆盖）" : ""}` : "未配置"}</span>
        </label>
        <label className="block space-y-2 text-sm font-bold"><span>Base URL</span><Input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} disabled={!canWrite || busy !== null} /></label>
        <label className="block space-y-2 text-sm font-bold">
          <span>Model</span>
          <Select value={model} onChange={(event) => setModel(event.target.value)} disabled={!canWrite || busy !== null}>
            {settings.models.length === 0 ? <option value={model}>{model}</option> : settings.models.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </label>
        {settings.runtime !== "ready" ? <p className="text-sm text-red-600">DSH Runtime 未启动。请先启动 Host Runner。</p> : null}
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
        <div className="flex flex-wrap gap-3 pt-1">
          <Button type="button" variant="outline" onClick={() => void submit("test")} disabled={!canWrite || busy !== null}>测试连接</Button>
          <Button type="button" onClick={() => void submit("save")} disabled={!canWrite || busy !== null}>{settings.credential.configured ? "更新配置" : "保存"}</Button>
          {settings.credential.configured ? <Button type="button" variant="outline" onClick={() => void submit("delete")} disabled={!canWrite || busy !== null}>删除 Credential</Button> : null}
        </div>
      </div>
    </section>
  );
}
