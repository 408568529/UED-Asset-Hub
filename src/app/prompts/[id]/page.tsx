import { notFound, redirect } from "next/navigation";
import { knowledgeDetailHref } from "@/components/knowledge/knowledgeLinks";
import { promptService } from "@/services/promptService";

export default async function LegacyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { id } = await params;
  const item = await promptService.getPromptById(decodeURIComponent(id));
  if (!item) notFound();
  redirect(knowledgeDetailHref("prompt", item.id, (await searchParams).returnTo));
}
