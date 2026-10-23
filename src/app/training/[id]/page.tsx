import { notFound, redirect } from "next/navigation";
import { knowledgeDetailHref } from "@/components/knowledge/knowledgeLinks";
import { trainingService } from "@/services/trainingService";

export default async function LegacyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { id } = await params;
  const item = await trainingService.getVideoById(decodeURIComponent(id));
  if (!item) notFound();
  redirect(knowledgeDetailHref("training", item.id, (await searchParams).returnTo));
}
