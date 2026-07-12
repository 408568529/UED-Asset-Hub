"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/components/admin/LabeledField";
import { TagMultiSelectField } from "@/components/admin/TagMultiSelectField";
import type { ComponentSpec } from "@/types/componentSpec";

function parseTags(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseSortOrder(value: FormDataEntryValue | null) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && String(value ?? "").trim() ? numberValue : undefined;
}

export function ComponentSpecForm({ component }: { component?: ComponentSpec }) {
  const router = useRouter();
  const isEdit = Boolean(component);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const response = await fetch(isEdit ? `/api/components/${component?.id}` : "/api/components", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        docLink: String(formData.get("docLink") ?? ""),
        figmaLink: String(formData.get("figmaLink") ?? ""),
        tags: parseTags(formData.get("tags")),
        sortOrder: parseSortOrder(formData.get("sortOrder"))
      })
    });

    if (!response.ok) {
      setMessage("保存失败，请稍后重试。");
      return;
    }
    const result = (await response.json()) as { warning?: string };
    if (result.warning) {
      setMessage(result.warning);
      return;
    }
    router.push("/admin");
  }

  return (
    <form action={submit} className="mt-10 max-w-2xl space-y-5 border-t border-foreground/10 pt-8">
      <LabeledField label="组件名称">
        <Input name="name" required defaultValue={component?.name} placeholder="请输入组件名称" />
      </LabeledField>
      <LabeledField label="组件介绍">
        <Textarea name="description" required defaultValue={component?.description} placeholder="请输入组件介绍" rows={5} />
      </LabeledField>
      <LabeledField label="规范链接">
        <Input name="docLink" required defaultValue={component?.docLink} placeholder="请输入规范链接" />
      </LabeledField>
      <LabeledField label="Figma链接（可选）">
        <Input name="figmaLink" defaultValue={component?.figmaLink} placeholder="请输入Figma链接" />
      </LabeledField>
      <LabeledField label="标签（可选）">
        <TagMultiSelectField type="component-tag" name="tags" defaultValue={component?.tags} />
      </LabeledField>
      <LabeledField label="排序值（可选）">
        <Input name="sortOrder" type="number" defaultValue={component?.sortOrder} placeholder="数字越小越靠前" />
      </LabeledField>
      <div className="flex gap-3">
        <Button type="submit">{isEdit ? "保存修改" : "新增组件规范"}</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin")}>取消</Button>
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
