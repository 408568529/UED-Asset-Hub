import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { PromptForm } from "@/components/admin/PromptForm";
import { promptService } from "@/services/promptService";

export default async function EditPromptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prompt = await promptService.getPromptById(decodeURIComponent(id));
  if (!prompt) notFound();

  return (
    <AdminGuard>
      <AdminPageFrame title="编辑 Prompt Library" contentLayout="form"><PromptForm prompt={prompt} /></AdminPageFrame>
    </AdminGuard>
  );
}
