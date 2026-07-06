"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormToast } from "@/components/admin/FormToast";
import { LabeledField } from "@/components/admin/LabeledField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAdminPassword } from "@/lib/adminSession";
import type { FontAsset, FontCategory } from "@/types/font";

const categories: FontCategory[] = ["中文字体", "英文字体", "等宽字体", "图标字体", "品牌字体", "数字字体"];

function parseTags(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function parseSortOrder(value: FormDataEntryValue | null) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && String(value ?? "").trim() ? numberValue : undefined;
}

function getFontPayload(formData: FormData, font?: FontAsset) {
  return {
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? "中文字体"),
    cover: String(formData.get("cover") ?? ""),
    designer: String(formData.get("designer") ?? ""),
    officialUrl: String(formData.get("officialUrl") ?? ""),
    license: String(formData.get("license") ?? ""),
    version: font?.version ?? String(formData.get("version") ?? "v1.0.0"),
    tags: parseTags(formData.get("tags")),
    sortOrder: parseSortOrder(formData.get("sortOrder"))
  };
}

export function FontForm({ font }: { font?: FontAsset }) {
  const router = useRouter();
  const isEdit = Boolean(font);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" | "warning" } | null>(null);

  function showToast(nextToast: { message: string; tone?: "success" | "error" | "warning" }) {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 2400);
  }

  async function submit(formData: FormData) {
    if (!isEdit) {
      const response = await fetch("/api/fonts", {
        method: "POST",
        headers: { "x-admin-password": getAdminPassword() },
        body: formData
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        setMessage(result.message ?? "字体上传失败，请确认文件格式。");
        showToast({ message: result.message ?? "字体上传失败，请确认文件格式。", tone: "error" });
        return;
      }
      const result = await response.json().catch(() => ({})) as { warning?: string };
      showToast({ message: result.warning ?? "字体上传成功。", tone: result.warning ? "warning" : "success" });
      window.setTimeout(() => router.push("/admin"), 700);
      return;
    }

    const metaResponse = await fetch(`/api/fonts/${font?.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-password": getAdminPassword() },
      body: JSON.stringify(getFontPayload(formData, font))
    });
    if (!metaResponse.ok) {
      const result = await metaResponse.json().catch(() => ({})) as { message?: string };
      setMessage(result.message ?? "字体信息保存失败。");
      showToast({ message: result.message ?? "字体信息保存失败。", tone: "error" });
      return;
    }

    const file = formData.get("file");
    if (file instanceof File && file.size > 0) {
      const versionFormData = new FormData();
      versionFormData.set("version", String(formData.get("version") ?? font?.version ?? "v1.0.0"));
      versionFormData.set("file", file);
      const versionResponse = await fetch(`/api/fonts/${font?.id}/versions`, {
        method: "POST",
        headers: { "x-admin-password": getAdminPassword() },
        body: versionFormData
      });
      if (!versionResponse.ok) {
        const result = await versionResponse.json().catch(() => ({})) as { message?: string };
        setMessage(result.message ?? "元数据已保存，但字体新版本上传失败。");
        showToast({ message: result.message ?? "元数据已保存，但字体新版本上传失败。", tone: "error" });
        return;
      }
    }

    showToast({ message: "字体信息保存成功。" });
    window.setTimeout(() => router.push("/admin"), 700);
  }

  return (
    <form action={submit} className="mt-10 max-w-2xl space-y-5 border-t border-foreground/10 pt-8">
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      <LabeledField label="字体名称">
        <Input name="name" required defaultValue={font?.name} placeholder="例如：PingFang Team Pack" />
      </LabeledField>
      <LabeledField label="字体介绍">
        <Textarea name="description" required defaultValue={font?.description} placeholder="说明字体用途、风格和适用场景" rows={4} />
      </LabeledField>
      <LabeledField label="字体分类">
        <select name="category" defaultValue={font?.category ?? "中文字体"} className="h-12 w-full border border-foreground/[0.08] bg-white px-4 text-sm outline-none focus:border-foreground/25">
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </LabeledField>
      <LabeledField label={isEdit ? "新版本号（上传文件时生效）" : "版本号"}>
        <Input name="version" required defaultValue={font?.version ?? "v1.0.0"} placeholder="例如：v1.0.0" />
      </LabeledField>
      <LabeledField label={isEdit ? "上传新版本文件（可选）" : "字体文件"}>
        <Input name="file" type="file" required={!isEdit} accept=".otf,.ttf,.woff,.woff2,.zip" className="py-2" />
      </LabeledField>
      <LabeledField label="设计师（可选）">
        <Input name="designer" defaultValue={font?.designer} placeholder="请输入设计师或厂商" />
      </LabeledField>
      <LabeledField label="字体官网（可选）">
        <Input name="officialUrl" defaultValue={font?.officialUrl} placeholder="https://..." />
      </LabeledField>
      <LabeledField label="版权说明（可选）">
        <Textarea name="license" defaultValue={font?.license} placeholder="说明授权范围、商用限制或团队使用约定" rows={4} />
      </LabeledField>
      <LabeledField label="标签（可选）">
        <Input name="tags" defaultValue={(font?.tags ?? []).join(", ")} placeholder="用逗号分隔，例如：品牌, 标题, 免费商用" />
      </LabeledField>
      <LabeledField label="封面链接（可选）">
        <Input name="cover" defaultValue={font?.cover} placeholder="请输入封面图链接" />
      </LabeledField>
      <LabeledField label="排序值（可选）">
        <Input name="sortOrder" type="number" defaultValue={font?.sortOrder} placeholder="数字越小越靠前" />
      </LabeledField>
      <div className="flex gap-3">
        <Button type="submit">{isEdit ? "保存字体" : "发布字体"}</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin")}>取消</Button>
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
