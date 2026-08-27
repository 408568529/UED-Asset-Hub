import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { TrainingForm } from "@/components/training/TrainingForm";
import { getAdminReturnTo } from "@/lib/adminNavigation";
import { trainingService } from "@/services/trainingService";

export default async function CreateTrainingPage({ searchParams }: { searchParams: Promise<{ folderId?: string; returnTo?: string }> }) {
  const { folderId, returnTo } = await searchParams;
  const folder = folderId ? await trainingService.getFolderById(folderId) : null;
  const destination = getAdminReturnTo(returnTo ?? null, "/admin/training");
  return <AdminGuard><AdminPageFrame title="上传培训视频" description="上传或关联现有服务器培训媒体。" contentLayout="form" returnHref={destination} returnLabel="返回培训资料"><TrainingForm initialFolderName={folder?.name} returnTo={returnTo} /></AdminPageFrame></AdminGuard>;
}
