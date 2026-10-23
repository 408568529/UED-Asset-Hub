import { notFound, redirect } from "next/navigation";
import { knowledgeDetailHref } from "@/components/knowledge/knowledgeLinks";
import { skillService } from "@/services/skillService";

export default async function LegacyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { id } = await params;
  const item = await skillService.getSkillById(decodeURIComponent(id));
  if (!item) notFound();
  redirect(knowledgeDetailHref("skill", item.id, (await searchParams).returnTo));
}
