import { redirect } from "next/navigation";
import { knowledgeListHref } from "@/components/knowledge/knowledgeLinks";

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ q?: string; model?: string }> }) {
  redirect(knowledgeListHref("training", await searchParams));
}
