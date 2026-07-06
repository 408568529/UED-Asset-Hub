"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormToast } from "@/components/admin/FormToast";
import { LabeledField } from "@/components/admin/LabeledField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAdminPassword } from "@/lib/adminSession";
import type { Skill, SkillCategory } from "@/types/skill";

const categories: SkillCategory[] = ["Codex", "Claude", "Cursor", "Prompt", "Workflow", "MCP", "Other"];

function parseTags(value: FormDataEntryValue | null) {
  return String(value ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

export function SkillForm({ skill }: { skill?: Skill }) {
  const router = useRouter();
  const isEdit = Boolean(skill);
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" | "warning" } | null>(null);

  function showToast(nextToast: { message: string; tone?: "success" | "error" | "warning" }) {
    setToast(nextToast);
    window.setTimeout(() => setToast(null), 2400);
  }

  async function submit(formData: FormData) {
    if (isEdit && skill) {
      const packageFile = formData.get("package");
      const hasPackage = packageFile instanceof File && packageFile.size > 0;
      const response = await fetch(`/api/skills/${skill.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": getAdminPassword() },
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          description: String(formData.get("description") ?? ""),
          cover: String(formData.get("cover") ?? ""),
          category: String(formData.get("category") ?? "Other"),
          version: skill.version,
          author: String(formData.get("author") ?? "admin"),
          tags: parseTags(formData.get("tags")),
          readme: String(formData.get("readme") ?? ""),
          changeLog: String(formData.get("changeLog") ?? "上传新版本")
        })
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { message?: string };
        setMessage(result.message ?? "保存失败，请稍后重试。");
        showToast({ message: result.message ?? "保存失败，请稍后重试。", tone: "error" });
        return;
      }

      if (hasPackage) {
        const versionFormData = new FormData();
        versionFormData.set("version", String(formData.get("version") ?? skill.version));
        versionFormData.set("updateType", String(formData.get("updateType") ?? "version"));
        versionFormData.set("package", packageFile);
        versionFormData.set("readme", String(formData.get("readme") ?? ""));
        versionFormData.set("changeLog", String(formData.get("changeLog") ?? "上传新版本"));
        const versionResponse = await fetch(`/api/skills/${skill.id}/versions`, {
          method: "POST",
          headers: { "x-admin-password": getAdminPassword() },
          body: versionFormData
        });
        if (!versionResponse.ok) {
          const result = await versionResponse.json().catch(() => ({})) as { message?: string };
          setMessage(result.message ?? "元数据已保存，但 ZIP 上传失败，请确认文件为 ZIP。");
          showToast({ message: result.message ?? "元数据已保存，但 ZIP 上传失败，请确认文件为 ZIP。", tone: "error" });
          return;
        }
        const versionResult = await versionResponse.json().catch(() => ({})) as { warning?: string };
        if (versionResult.warning) {
          showToast({ message: versionResult.warning, tone: "warning" });
          window.setTimeout(() => router.push(`/skills/${skill.id}`), 900);
          return;
        }
      }

      showToast({ message: hasPackage ? "Skill 版本上传成功。" : "Skill 信息保存成功。" });
      window.setTimeout(() => router.push(hasPackage ? `/skills/${skill.id}` : "/admin"), 700);
      return;
    }

    const response = await fetch("/api/skills", {
      method: isEdit ? "PUT" : "POST",
      headers: isEdit ? { "Content-Type": "application/json", "x-admin-password": getAdminPassword() } : { "x-admin-password": getAdminPassword() },
      body: formData
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { message?: string };
      setMessage(result.message ?? (isEdit ? "保存失败，请稍后重试。" : "上传失败，请确认文件为 ZIP。"));
      showToast({ message: result.message ?? (isEdit ? "保存失败，请稍后重试。" : "上传失败，请确认文件为 ZIP。"), tone: "error" });
      return;
    }
    const result = await response.json().catch(() => ({})) as { warning?: string };
    showToast({ message: result.warning ?? "Skill 上传成功。", tone: result.warning ? "warning" : "success" });
    window.setTimeout(() => router.push("/admin"), 700);
  }

  return (
    <form action={submit} className="mt-10 max-w-2xl space-y-5 border-t border-foreground/10 pt-8">
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      <LabeledField label="Skill 名称">
        <Input name="name" required defaultValue={skill?.name} placeholder="请输入 Skill 名称" />
      </LabeledField>
      <LabeledField label="介绍">
        <Textarea name="description" required defaultValue={skill?.description} placeholder="请输入 Skill 介绍" rows={4} />
      </LabeledField>
      <LabeledField label="分类">
        <select name="category" defaultValue={skill?.category ?? "Other"} className="h-11 w-full border border-border bg-white px-4 text-sm outline-none">
          {categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>
      </LabeledField>
      <LabeledField label={isEdit ? "新版本号（上传 ZIP 时生效）" : "版本号"}>
        <Input name="version" required defaultValue={skill?.version ?? "v1.0.0"} placeholder="例如：v1.0.0" />
      </LabeledField>
      <LabeledField label="作者">
        <Input name="author" required defaultValue={skill?.author ?? "admin"} placeholder="请输入作者" />
      </LabeledField>
      <LabeledField label="标签">
        <Input name="tags" defaultValue={(skill?.tags ?? []).join(", ")} placeholder="用逗号分隔，例如：AI, Workflow, Coding" />
      </LabeledField>
      <LabeledField label="封面链接（可选）">
        <Input name="cover" defaultValue={skill?.cover} placeholder="请输入封面图链接" />
      </LabeledField>
      <LabeledField label={isEdit ? "上传新版本 ZIP（可选）" : "上传 ZIP"}>
        <Input name="package" type="file" required={!isEdit} accept=".zip,application/zip" className="rounded-2xl py-2" />
      </LabeledField>
      {isEdit ? (
        <LabeledField label="更新类型">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="cursor-pointer border border-foreground/10 bg-white p-4 transition hover:border-foreground">
              <input name="updateType" type="radio" value="version" defaultChecked className="mr-2" />
              <span className="text-sm font-bold">版本更新</span>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">保留旧版本，新增一条版本记录。</p>
            </label>
            <label className="cursor-pointer border border-foreground/10 bg-white p-4 transition hover:border-foreground">
              <input name="updateType" type="radio" value="overwrite" className="mr-2" />
              <span className="text-sm font-bold">覆盖上传</span>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">替换当前版本包，不新增版本记录。</p>
            </label>
          </div>
        </LabeledField>
      ) : null}
      <LabeledField label="README">
        <Textarea name="readme" defaultValue={skill?.readme} placeholder="支持 Markdown 内容" rows={8} />
      </LabeledField>
      <LabeledField label="Change Log">
        <Textarea name="changeLog" defaultValue={skill?.changeLog} placeholder="例如：上传新版本" rows={4} />
      </LabeledField>
      <div className="flex gap-3">
        <Button type="submit">{isEdit ? "保存修改" : "发布 Skill"}</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin")}>取消</Button>
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
