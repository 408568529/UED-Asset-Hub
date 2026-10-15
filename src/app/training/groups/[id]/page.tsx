import { notFound, redirect } from "next/navigation";
import { trainingService } from "@/services/trainingService";

export default async function TrainingGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const folder = await trainingService.getFolderById(decodeURIComponent(id));
  if (!folder) notFound();
  const query = new URLSearchParams({ section: "training", category: folder.name });
  redirect(`/knowledge?${query}`);
}
