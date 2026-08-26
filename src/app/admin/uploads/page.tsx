import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { UploadRecordList } from "@/components/admin/UploadRecordList";
import { Button } from "@/components/ui/button";
import { uploadRecordService } from "@/services/uploadRecordService";
import Link from "next/link";

export default async function AdminUploadsPage() {
  const uploads = await uploadRecordService.getUploads();

  return (
    <AdminGuard>
      <main><AdminWorkspace>
        <header className="admin-page-header"><div><h1 className="text-lg font-black tracking-[-0.02em]">上传记录</h1><p className="mt-0.5 text-xs text-muted-foreground">查看已上传文件与处理状态。</p></div><Button asChild><Link href="/admin/uploads/new">上传文件</Link></Button></header>
        <div className="admin-page-content"><UploadRecordList uploads={uploads} /></div>
      </AdminWorkspace></main>
    </AdminGuard>
  );
}
