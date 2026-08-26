import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { SkillForm } from "@/components/admin/SkillForm";
import { skillService } from "@/services/skillService";

export default async function EditSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await skillService.getSkillById(decodeURIComponent(id));
  if (!skill) notFound();

  return (
    <AdminGuard>
      <AdminPageFrame title="编辑 Skill"><SkillForm skill={skill} /></AdminPageFrame>
    </AdminGuard>
  );
}
