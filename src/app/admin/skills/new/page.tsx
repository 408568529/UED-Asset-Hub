import { AdminGuard } from "@/components/admin/AdminGuard";
import { SkillForm } from "@/components/admin/SkillForm";

export default function NewSkillPage() {
  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">New Skill</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">新建 Skill</h1>
        <SkillForm />
      </main>
    </AdminGuard>
  );
}
