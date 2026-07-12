import { AdminGuard } from "@/components/admin/AdminGuard";
import { TrainingForm } from "@/components/training/TrainingForm";
import { trainingService } from "@/services/trainingService";

export default async function CreateTrainingPage({ searchParams }: { searchParams: Promise<{ folderId?: string }> }) {
  const { folderId } = await searchParams;
  const folder = folderId ? await trainingService.getFolderById(folderId) : null;
  return <AdminGuard><main className="mx-auto max-w-7xl px-5 py-14 md:py-20"><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Upload Training</p><h1 className="mt-5 text-3xl font-black">上传培训视频</h1><TrainingForm initialFolderName={folder?.name} /></main></AdminGuard>;
}
