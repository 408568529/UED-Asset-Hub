"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LabeledField } from "@/components/admin/LabeledField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getAdminPassword } from "@/lib/adminSession";

export function UploadForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: {
        "x-admin-password": getAdminPassword()
      },
      body: formData
    });

    if (!response.ok) {
      setMessage("上传失败，请稍后重试。");
      return;
    }

    router.push("/admin/uploads");
  }

  return (
    <form action={submit} className="mt-10 max-w-2xl space-y-5 border-t border-foreground/10 pt-8">
      <LabeledField label="选择文件">
        <Input name="file" type="file" required className="rounded-2xl py-2" />
      </LabeledField>
      <LabeledField label="归属模块（可选）">
        <select name="assetModule" className="h-11 w-full border border-border bg-white px-4 text-sm outline-none">
          <option value="">未归类上传</option>
          <option value="product">Vibe Product</option>
          <option value="component">组件规范</option>
          <option value="sop">标准 SOP</option>
          <option value="skill">Skill Center</option>
        </select>
      </LabeledField>
      <LabeledField label="关联资产ID（可选）">
        <Input name="relatedAssetId" placeholder="例如：design-review-sop" />
      </LabeledField>
      <LabeledField label="关联资产名称（可选）">
        <Input name="relatedAssetName" placeholder="例如：设计走查 SOP" />
      </LabeledField>
      <LabeledField label="上传摘要（可选）">
        <Textarea name="summary" placeholder="说明这次上传的内容和用途" rows={4} />
      </LabeledField>
      <div className="flex gap-3">
        <Button type="submit">上传文件</Button>
        <Button type="button" variant="outline" onClick={() => router.push("/admin/uploads")}>取消</Button>
      </div>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
