import { redirect } from "next/navigation";
import { knowledgeListHref } from "@/components/knowledge/knowledgeLinks";

export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ q?: string; model?: string }> }) {
  redirect(knowledgeListHref("skills", await searchParams));
}
