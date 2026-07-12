import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { TrainingForm } from "@/components/training/TrainingForm";
import { trainingService } from "@/services/trainingService";

export default async function EditTrainingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const video = await trainingService.getVideoById(decodeURIComponent(id));
  if (!video) notFound();
  return <AdminGuard><main className="mx-auto max-w-7xl px-5 py-14 md:py-20"><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Edit Training</p><h1 className="mt-5 text-3xl font-black">编辑培训资料</h1><TrainingForm video={video} /></main></AdminGuard>;
}
