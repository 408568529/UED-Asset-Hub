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
    <main className="page-shell page-frame">
      <Link href="/training" className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />返回培训资料</Link>
      <div className="surface-panel mt-8 flex flex-wrap items-end justify-between gap-6 border-t-[3px] border-t-primary p-6 md:p-9">
        <div><p className="section-kicker">Training Folder</p><h1 className="mt-4 text-3xl font-black tracking-[-0.025em] md:text-4xl">{folder.name}</h1><p className="mt-4 text-sm text-muted-foreground">{folder.videoCount} 个视频 · 更新于 {folder.updatedAt.slice(0, 10)}</p></div>
        <AdminTrainingUploadLink folderId={folder.id} />
      </div>
      <TrainingFolderVideos videos={videos} />
    </main>
  );
}
