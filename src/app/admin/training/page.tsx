import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { TrainingAdminList } from "@/components/training/TrainingAdminList";
import { Button } from "@/components/ui/button";
import { trainingService } from "@/services/trainingService";

export default async function AdminTrainingPage() {
  const videos = await trainingService.getVideos();
  return <AdminGuard><AdminPageFrame title="培训资料管理" description="维护团队培训视频与资料。" actions={<Button asChild><Link href="/admin/training/create?returnTo=/admin/training"><Plus size={16} />上传培训视频</Link></Button>}><TrainingAdminList initialVideos={videos} /></AdminPageFrame></AdminGuard>;
}
