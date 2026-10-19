import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
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
        <WorkspacePageHeader className="admin-page-header" title="上传记录" description="查看已上传文件与处理状态。" actions={<Button asChild><Link href="/admin/uploads/new">上传文件</Link></Button>} />
        <div className="admin-page-content"><UploadRecordList uploads={uploads} /></div>
      </AdminWorkspace></main>
    </AdminGuard>
  );
}
