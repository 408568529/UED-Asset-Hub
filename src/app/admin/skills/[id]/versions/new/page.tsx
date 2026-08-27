import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { SkillVersionForm } from "@/components/admin/SkillVersionForm";
import { skillService } from "@/services/skillService";

export default async function NewSkillVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await skillService.getSkillById(decodeURIComponent(id));
  if (!skill) notFound();

  return (
    <AdminGuard>
      <AdminPageFrame title="上传新版本" description={skill.name} contentLayout="form"><SkillVersionForm skillId={skill.id} /></AdminPageFrame>
    </AdminGuard>
  );
}
