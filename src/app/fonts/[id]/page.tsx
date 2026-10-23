import { notFound, redirect } from "next/navigation";
import { knowledgeDetailHref } from "@/components/knowledge/knowledgeLinks";
import { fontService } from "@/services/fontService";

export default async function LegacyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { id } = await params;
  const item = await fontService.getFontById(decodeURIComponent(id));
  if (!item) notFound();
  redirect(knowledgeDetailHref("font", item.id, (await searchParams).returnTo));
}
