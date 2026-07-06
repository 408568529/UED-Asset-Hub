import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { SkillForm } from "@/components/admin/SkillForm";
import { skillService } from "@/services/skillService";

export default async function EditSkillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skill = await skillService.getSkillById(decodeURIComponent(id));
  if (!skill) notFound();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Edit Skill</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">编辑 Skill</h1>
        <SkillForm skill={skill} />
      </main>
    </AdminGuard>
  );
}
