import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { TrainingAdminList } from "@/components/training/TrainingAdminList";
import { Button } from "@/components/ui/button";
import { trainingService } from "@/services/trainingService";

export default async function AdminTrainingPage() {
  const videos = await trainingService.getVideos();
  return <AdminGuard><main className="mx-auto max-w-7xl px-5 py-14 md:py-20"><div className="flex flex-wrap items-end justify-between gap-6"><div><p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Admin / Training</p><h1 className="mt-5 text-3xl font-black">培训资料管理</h1></div><Button asChild><Link href="/admin/training/create"><Plus size={16} />上传培训视频</Link></Button></div><AdminWorkspace><TrainingAdminList initialVideos={videos} /></AdminWorkspace></main></AdminGuard>;
}
