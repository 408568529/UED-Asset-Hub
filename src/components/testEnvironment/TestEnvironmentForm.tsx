"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FormToast } from "@/components/admin/FormToast";
import { LabeledField } from "@/components/admin/LabeledField";
import { TagMultiSelectField } from "@/components/admin/TagMultiSelectField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SafeTestEnvironment, TestEnvironmentInput, TestEnvironmentType } from "@/types/testEnvironment";

const initialValue: TestEnvironmentInput = { productName: "", clientVersionName: "", environmentType: "UAT", environmentName: "", environmentUrl: "", username: "", password: "", description: "", tags: [], status: "available" };

export function TestEnvironmentForm({ environmentId }: { environmentId?: string }) {
  const router = useRouter();
  const [value, setValue] = useState<TestEnvironmentInput>(initialValue);
  const [loading, setLoading] = useState(Boolean(environmentId));
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" | "warning" } | null>(null);

  useEffect(() => {
    if (!environmentId) return;
    fetch("/api/test-environments")
      .then((response) => response.json())
      .then((items: SafeTestEnvironment[]) => {
        const item = items.find((environment) => environment.id === environmentId);
        if (item) setValue({ ...item, password: "" });
      })
      .finally(() => setLoading(false));
  }, [environmentId]);

  function update<K extends keyof TestEnvironmentInput>(key: K, nextValue: TestEnvironmentInput[K]) {
    setValue((current) => ({ ...current, [key]: nextValue }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const response = await fetch(environmentId ? `/api/test-environments/${environmentId}` : "/api/test-environments", {
      method: environmentId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    });
    const result = await response.json().catch(() => ({})) as { message?: string; warning?: string };
    if (!response.ok) {
      setToast({ message: result.message ?? "测试环境保存失败。", tone: "error" });
      setSubmitting(false);
      return;
    }
    setToast({ message: result.warning ?? "测试环境保存成功。", tone: result.warning ? "warning" : "success" });
    window.setTimeout(() => router.push("/admin/test-environments"), 700);
  }

  if (loading) return <p className="mt-10 text-muted-foreground">正在读取测试环境...</p>;

  return (
    <form onSubmit={submit} className="mt-10 max-w-2xl space-y-5 border-t border-foreground/10 pt-8">
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      <LabeledField label="产品名称" required><Input value={value.productName} onChange={(event) => update("productName", event.target.value)} required /></LabeledField>
      <LabeledField label="客户版本名称" required><Input value={value.clientVersionName} onChange={(event) => update("clientVersionName", event.target.value)} required /></LabeledField>
      <LabeledField label="环境类型" required><Select value={value.environmentType} onChange={(event) => update("environmentType", event.target.value as TestEnvironmentType)}>{["UAT", "TEST", "DEMO", "OTHER"].map((item) => <option key={item}>{item}</option>)}</Select></LabeledField>
      <LabeledField label="环境地址"><Input type="url" value={value.environmentUrl ?? ""} onChange={(event) => update("environmentUrl", event.target.value)} /></LabeledField>
      <LabeledField label="测试账号" required><Input value={value.username} onChange={(event) => update("username", event.target.value)} required autoComplete="off" /></LabeledField>
      <LabeledField label={environmentId ? "测试密码（留空则不修改）" : "测试密码"} required={!environmentId}><Input type="password" value={value.password ?? ""} onChange={(event) => update("password", event.target.value)} required={!environmentId} autoComplete="new-password" /></LabeledField>
      <LabeledField label="使用说明"><Textarea value={value.description ?? ""} onChange={(event) => update("description", event.target.value)} rows={5} /></LabeledField>
      <LabeledField label="标签"><TagMultiSelectField type="test-environment-tag" value={value.tags} onChange={(tags) => update("tags", tags)} /></LabeledField>
      <div className="flex gap-3"><Button type="submit" disabled={submitting}>{submitting ? "保存中..." : "保存测试环境"}</Button><Button type="button" variant="outline" disabled={submitting} onClick={() => router.push("/admin/test-environments")}>取消</Button></div>
    </form>
  );
}
