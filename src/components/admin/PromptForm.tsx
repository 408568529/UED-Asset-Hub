"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormToast } from "@/components/admin/FormToast";
import { LabeledField } from "@/components/admin/LabeledField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAdminPassword } from "@/lib/adminSession";
import type { PromptAsset, PromptDifficulty, PromptModel, PromptOutputType } from "@/types/prompt";

const models: PromptModel[] = ["ChatGPT", "Codex", "Claude", "Cursor", "Gemini", "DeepSeek"];
const difficulties: PromptDifficulty[] = ["初级", "中级", "高级"];
const outputTypes: PromptOutputType[] = ["Markdown", "HTML", "React", "JSON", "Text", "Image", "Table"];

function parseList(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function parseChecked(formData: FormData, name: string) {
  return formData.getAll(name).map(String).filter(Boolean);
}

export function PromptForm({ prompt }: { prompt?: PromptAsset }) {
  const router = useRouter();
  const isEdit = Boolean(prompt);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" | "warning" } | null>(null);

  function showToast(nextToast: { message: string; tone?: "success" | "error" | "warning" }) {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 2400);
  }

  async function submit(formData: FormData) {
    const body = {
      name: String(formData.get("name") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      cover: String(formData.get("cover") ?? ""),
      category: String(formData.get("category") ?? "通用 Prompt"),
      tags: parseList(formData.get("tags")),
      author: String(formData.get("author") ?? "admin"),
      version: String(formData.get("version") ?? "v1.0.0"),
      models: parseChecked(formData, "models"),
      scenarios: parseList(formData.get("scenarios")),
      outputTypes: parseChecked(formData, "outputTypes"),
      difficulty: String(formData.get("difficulty") ?? "初级"),
      rating: Number(formData.get("rating") ?? 5),
      content: String(formData.get("content") ?? ""),
      usageGuide: String(formData.get("usageGuide") ?? ""),
      exampleInput: String(formData.get("exampleInput") ?? ""),
      exampleOutput: String(formData.get("exampleOutput") ?? "")
    };

    const response = await fetch(isEdit ? `/api/prompts/${prompt?.id}` : "/api/prompts", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": getAdminPassword() },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { message?: string };
      setMessage(result.message ?? "Prompt 保存失败。");
      showToast({ message: result.message ?? "Prompt 保存失败。", tone: "error" });
      return;
    }
    const result = await response.json().catch(() => ({})) as { warning?: string };
    showToast({ message: result.warning ?? "Prompt 保存成功。", tone: result.warning ? "warning" : "success" });
    window.setTimeout(() => router.push("/admin"), 700);
  }

  return (
    <form action={submit} className="mt-10 max-w-3xl space-y-5 border-t border-foreground/10 pt-8">
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      <LabeledField label="Prompt 名称">
        <Input name="name" required defaultValue={prompt?.name} placeholder="例如：PRD → React 页面生成 Prompt" />
      </LabeledField>
      <LabeledField label="一句话介绍">
        <Textarea name="summary" required defaultValue={prompt?.summary} placeholder="说明这个 Prompt 解决什么问题" rows={3} />
      </LabeledField>
      <div className="grid gap-5 md:grid-cols-2">
        <LabeledField label="分类">
          <Input name="category" required defaultValue={prompt?.category ?? "设计研发"} placeholder="例如：代码生成" />
        </LabeledField>
        <LabeledField label="版本号">
          <Input name="version" required defaultValue={prompt?.version ?? "v1.0.0"} />
        </LabeledField>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <LabeledField label="作者">
          <Input name="author" required defaultValue={prompt?.author ?? "admin"} />
        </LabeledField>
        <LabeledField label="推荐指数">
          <Input name="rating" type="number" min={1} max={5} required defaultValue={prompt?.rating ?? 5} />
        </LabeledField>
      </div>
      <LabeledField label="适用模型">
        <div className="grid gap-2 sm:grid-cols-3">
          {models.map((model) => (
            <label key={model} className="border border-foreground/10 bg-white p-3 text-sm font-bold">
              <input name="models" type="checkbox" value={model} defaultChecked={(prompt?.models ?? ["ChatGPT", "Codex"]).includes(model)} className="mr-2" />
              {model}
            </label>
          ))}
        </div>
      </LabeledField>
      <LabeledField label="输出类型">
        <div className="grid gap-2 sm:grid-cols-4">
          {outputTypes.map((outputType) => (
            <label key={outputType} className="border border-foreground/10 bg-white p-3 text-sm font-bold">
              <input name="outputTypes" type="checkbox" value={outputType} defaultChecked={(prompt?.outputTypes ?? ["Markdown"]).includes(outputType)} className="mr-2" />
              {outputType}
            </label>
          ))}
        </div>
      </LabeledField>
      <LabeledField label="难度">
        <select name="difficulty" defaultValue={prompt?.difficulty ?? "初级"} className="h-12 w-full border border-foreground/[0.08] bg-white px-4 text-sm outline-none focus:border-foreground/25">
          {difficulties.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}
        </select>
      </LabeledField>
      <LabeledField label="使用场景">
        <Input name="scenarios" required defaultValue={(prompt?.scenarios ?? []).join(", ")} placeholder="用逗号分隔，例如：PRD生成, React, 代码生成" />
      </LabeledField>
      <LabeledField label="标签">
        <Input name="tags" defaultValue={(prompt?.tags ?? []).join(", ")} placeholder="用逗号分隔，例如：PRD, Codex, 页面生成" />
      </LabeledField>
      <LabeledField label="封面链接（可选）">
        <Input name="cover" defaultValue={prompt?.cover} placeholder="请输入封面图链接" />
      </LabeledField>
      <LabeledField label="Prompt 正文">
        <Textarea name="content" required defaultValue={prompt?.content} placeholder="粘贴完整 Prompt，可包含 Markdown 和代码块" rows={12} />
      </LabeledField>
      <LabeledField label="使用说明">
        <Textarea name="usageGuide" defaultValue={prompt?.usageGuide} placeholder="说明输入、输出和适用边界" rows={5} />
      </LabeledField>
      <LabeledField label="示例输入">
        <Textarea name="exampleInput" defaultValue={prompt?.exampleInput} rows={5} />
      </LabeledField>
      <LabeledField label="示例输出">
        <Textarea name="exampleOutput" defaultValue={prompt?.exampleOutput} rows={5} />
      </LabeledField>
      <div className="flex gap-3">
        <Button type="submit">{isEdit ? "保存 Prompt" : "发布 Prompt"}</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin")}>取消</Button>
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
