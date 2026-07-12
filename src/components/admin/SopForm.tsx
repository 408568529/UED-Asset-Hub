"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LabeledField } from "@/components/admin/LabeledField";
import { TagMultiSelectField } from "@/components/admin/TagMultiSelectField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Sop } from "@/types/sop";

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

export function SopForm({ sop }: { sop?: Sop }) {
  const router = useRouter();
  const isEdit = Boolean(sop);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const response = await fetch(isEdit ? `/api/sops/${sop?.id}` : "/api/sops", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        docLink: String(formData.get("docLink") ?? ""),
        owner: String(formData.get("owner") ?? ""),
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
      <LabeledField label="SOP名称">
        <Input name="name" required defaultValue={sop?.name} placeholder="请输入 SOP 名称" />
      </LabeledField>
      <LabeledField label="SOP介绍">
        <Textarea name="description" required defaultValue={sop?.description} placeholder="请输入 SOP 介绍" rows={5} />
      </LabeledField>
      <LabeledField label="文档链接">
        <Input name="docLink" required defaultValue={sop?.docLink} placeholder="请输入 SOP 文档链接" />
      </LabeledField>
      <LabeledField label="负责人（可选）">
        <Input name="owner" defaultValue={sop?.owner} placeholder="请输入负责人或团队" />
      </LabeledField>
      <LabeledField label="标签（可选）">
        <TagMultiSelectField type="sop-tag" name="tags" defaultValue={sop?.tags} />
      </LabeledField>
      <LabeledField label="排序值（可选）">
        <Input name="sortOrder" type="number" defaultValue={sop?.sortOrder} placeholder="数字越小越靠前" />
      </LabeledField>
      <div className="flex gap-3">
        <Button type="submit">{isEdit ? "保存修改" : "新增 SOP"}</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin")}>取消</Button>
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
