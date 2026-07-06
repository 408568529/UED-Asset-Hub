"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LabeledField } from "@/components/admin/LabeledField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAdminPassword } from "@/lib/adminSession";

export function SkillVersionForm({ skillId }: { skillId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const response = await fetch(`/api/skills/${skillId}/versions`, {
      method: "POST",
      headers: { "x-admin-password": getAdminPassword() },
      body: formData
    });
    if (!response.ok) {
      setMessage("上传失败，请确认文件为 ZIP。");
      return;
    }
    router.push(`/skills/${skillId}`);
  }

  return (
    <form action={submit} className="mt-10 max-w-2xl space-y-5 border-t border-foreground/10 pt-8">
      <LabeledField label="版本号">
        <Input name="version" required defaultValue="v1.0.1" />
      </LabeledField>
      <LabeledField label="上传 ZIP">
        <Input name="package" type="file" required accept=".zip,application/zip" className="rounded-2xl py-2" />
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
