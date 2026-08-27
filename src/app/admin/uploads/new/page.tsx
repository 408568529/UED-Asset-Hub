import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { UploadForm } from "@/components/admin/UploadForm";

export default function NewUploadPage() {
  return (
    <AdminGuard>
      <AdminPageFrame title="上传文件" description="上传记录会持续保留，完成后返回上传记录。" contentLayout="form" returnHref="/admin/uploads" returnLabel="返回上传记录"><UploadForm /></AdminPageFrame>
    </AdminGuard>
  );
}
