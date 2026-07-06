import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SkillVersionForm } from "@/components/admin/SkillVersionForm";
import { skillService } from "@/services/skillService";

export default async function NewSkillVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await skillService.getSkillById(decodeURIComponent(id));
  if (!skill) notFound();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">New Skill Version</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">上传新版本</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">{skill.name}</p>
        <SkillVersionForm skillId={skill.id} />
      </main>
    </AdminGuard>
  );
}
