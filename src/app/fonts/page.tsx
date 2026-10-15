import { redirect } from "next/navigation";
import { knowledgeListHref } from "@/components/knowledge/knowledgeLinks";

export default async function FontsPage({ searchParams }: { searchParams: Promise<{ q?: string; model?: string }> }) {
  redirect(knowledgeListHref("fonts", await searchParams));
}
