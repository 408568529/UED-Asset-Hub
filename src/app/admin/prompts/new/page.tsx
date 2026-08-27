import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { PromptForm } from "@/components/admin/PromptForm";

export default function NewPromptPage() {
  return (
    <AdminGuard>
      <AdminPageFrame title="新建 Prompt Library" contentLayout="form"><PromptForm /></AdminPageFrame>
    </AdminGuard>
  );
}
