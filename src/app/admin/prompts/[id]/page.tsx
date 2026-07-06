import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { PromptForm } from "@/components/admin/PromptForm";
import { promptService } from "@/services/promptService";

export default async function EditPromptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prompt = await promptService.getPromptById(decodeURIComponent(id));
  if (!prompt) notFound();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Edit Prompt</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">编辑 Prompt Library</h1>
        <PromptForm prompt={prompt} />
      </main>
    </AdminGuard>
  );
}
