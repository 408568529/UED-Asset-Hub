"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/components/admin/LabeledField";
import { getAdminPassword } from "@/lib/adminSession";
import type { Product } from "@/types/product";

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

export function ProductForm({ product }: { product?: Product }) {
  const router = useRouter();
  const isEdit = Boolean(product);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const response = await fetch(isEdit ? `/api/products/${product?.id}` : "/api/products", {
      method: isEdit ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-password": getAdminPassword()
      },
      body: JSON.stringify({
        name: String(formData.get("name") ?? ""),
        description: String(formData.get("description") ?? ""),
        link: String(formData.get("link") ?? ""),
        coverUrl: String(formData.get("coverUrl") ?? ""),
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
      <LabeledField label="产品名称">
        <Input name="name" required defaultValue={product?.name} placeholder="请输入产品名称" />
      </LabeledField>
      <LabeledField label="产品介绍">
        <Textarea name="description" required defaultValue={product?.description} placeholder="请输入产品介绍" rows={5} />
      </LabeledField>
      <LabeledField label="产品链接">
        <Input name="link" required defaultValue={product?.link} placeholder="请输入产品链接" />
      </LabeledField>
      <LabeledField label="封面图链接（可选）">
        <Input name="coverUrl" defaultValue={product?.coverUrl} placeholder="请输入封面图链接" />
      </LabeledField>
      <LabeledField label="标签（可选）">
        <Input name="tags" defaultValue={(product?.tags ?? []).join(", ")} placeholder="用逗号分隔，例如：AI, 工具" />
      </LabeledField>
      <LabeledField label="排序值（可选）">
        <Input name="sortOrder" type="number" defaultValue={product?.sortOrder} placeholder="数字越小越靠前" />
      </LabeledField>
      <div className="flex gap-3">
        <Button type="submit">{isEdit ? "保存修改" : "新增 Product"}</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin")}>取消</Button>
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
