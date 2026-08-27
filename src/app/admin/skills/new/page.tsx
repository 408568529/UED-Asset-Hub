import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { SkillForm } from "@/components/admin/SkillForm";

export default function NewSkillPage() {
  return (
    <AdminGuard>
      <AdminPageFrame title="新建 Skill" contentLayout="form"><SkillForm /></AdminPageFrame>
    </AdminGuard>
  );
}
