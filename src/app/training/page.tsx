import { ModulePageHeader } from "@/components/layout/ModulePageHeader";
import { TrainingFolderBrowser } from "@/components/training/TrainingFolderBrowser";
import { trainingService } from "@/services/trainingService";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const [videos, folders] = await Promise.all([trainingService.getVideos(), trainingService.getFolders()]);
  const searchIndex = Object.fromEntries(folders.map((folder) => [folder.id, videos.filter((video) => video.groupId === folder.id).flatMap((video) => [video.title, video.speaker, ...video.tags]).filter(Boolean).join(" ")]));
  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <ModulePageHeader eyebrow="Training Library" title="团队培训资料" description="按活动、批次或学习计划整理团队视频资料。" count={folders.length}>{null}</ModulePageHeader>
      <TrainingFolderBrowser initialFolders={folders} searchIndex={searchIndex} />
    </main>
  );
}
