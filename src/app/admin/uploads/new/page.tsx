import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { UploadForm } from "@/components/admin/UploadForm";

export default function NewUploadPage() {
  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Upload</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">上传文件</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">文件会保存到本地数据目录，上传记录会写入 uploads.json。</p>
        <AdminWorkspace><UploadForm /></AdminWorkspace>
      </main>
    </AdminGuard>
  );
}
