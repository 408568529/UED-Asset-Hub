"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormToast } from "@/components/admin/FormToast";
import { LabeledField } from "@/components/admin/LabeledField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function SkillVersionForm({ skillId }: { skillId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" | "warning" } | null>(null);

  async function submit(formData: FormData) {
    const response = await fetch(`/api/skills/${skillId}/versions`, {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({})) as { message?: string };
      setMessage(result.message ?? "上传失败，请确认文件为 ZIP。");
      setToast({ message: result.message ?? "上传失败，请确认文件为 ZIP。", tone: "error" });
      return;
    }
    const result = await response.json().catch(() => ({})) as { warning?: string };
    setToast({ message: result.warning ?? "Skill 新版本上传成功。", tone: result.warning ? "warning" : "success" });
    window.setTimeout(() => router.push(`/skills/${skillId}`), 700);
  }

  return (
    <form action={submit} className="mt-10 max-w-2xl space-y-5 border-t border-foreground/10 pt-8">
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      <LabeledField label="版本号">
        <Input name="version" required defaultValue="v1.0.1" />
      </LabeledField>
      <LabeledField label="上传 ZIP">
        <Input name="package" type="file" required accept=".zip,application/zip" />
      </LabeledField>
      <LabeledField label="README（可选）">
        <Textarea name="readme" rows={6} />
      </LabeledField>
      <LabeledField label="Change Log">
        <Textarea name="changeLog" placeholder="上传新版本" rows={4} />
      </LabeledField>
      <Button type="submit">上传新版本</Button>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
