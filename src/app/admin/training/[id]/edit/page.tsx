import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { TrainingForm } from "@/components/training/TrainingForm";
import { getAdminReturnTo } from "@/lib/adminNavigation";
import { trainingService } from "@/services/trainingService";

export default async function EditTrainingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { id } = await params;
  const video = await trainingService.getVideoById(decodeURIComponent(id));
  if (!video) notFound();
  const { returnTo } = await searchParams;
  const destination = getAdminReturnTo(returnTo ?? null, "/admin/training");
  return <AdminGuard><AdminPageFrame title="编辑培训资料" description="更新视频信息或替换媒体文件。" contentLayout="form" returnHref={destination} returnLabel="返回培训资料"><TrainingForm video={video} returnTo={returnTo} /></AdminPageFrame></AdminGuard>;
}
