import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminTrainingUploadLink } from "@/components/training/AdminTrainingUploadLink";
import { TrainingFolderVideos } from "@/components/training/TrainingFolderVideos";
import { trainingService } from "@/services/trainingService";

export const dynamic = "force-dynamic";

export default async function TrainingGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const folderId = decodeURIComponent(id);
  const [folder, videos] = await Promise.all([trainingService.getFolderById(folderId), trainingService.getVideos({ groupId: folderId })]);
  if (!folder) notFound();
  return (
    <main className="mx-auto max-w-7xl px-5 py-16 md:py-24">
      <Link href="/training" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />返回培训资料</Link>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-6 border-b border-foreground/[0.1] pb-10">
        <div><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Training Folder</p><h1 className="mt-5 text-3xl font-black">{folder.name}</h1><p className="mt-4 text-sm text-muted-foreground">{folder.videoCount} 个视频 · 更新于 {folder.updatedAt.slice(0, 10)}</p></div>
        <AdminTrainingUploadLink folderId={folder.id} />
      </div>
      <TrainingFolderVideos videos={videos} />
    </main>
  );
}
