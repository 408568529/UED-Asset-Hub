import { redirect } from "next/navigation";
import { knowledgeListHref } from "@/components/knowledge/knowledgeLinks";

export default async function SopsPage({ searchParams }: { searchParams: Promise<{ q?: string; model?: string }> }) {
  redirect(knowledgeListHref("sops", await searchParams));
}
