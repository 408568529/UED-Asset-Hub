import { AdminGuard } from "@/components/admin/AdminGuard";
import { PromptForm } from "@/components/admin/PromptForm";

export default function NewPromptPage() {
  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">New Prompt</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">新建 Prompt Library</h1>
        <PromptForm />
      </main>
    </AdminGuard>
  );
}
