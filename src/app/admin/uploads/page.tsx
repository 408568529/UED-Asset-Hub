import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { UploadRecordList } from "@/components/admin/UploadRecordList";
import { Button } from "@/components/ui/button";
import { uploadRecordService } from "@/services/uploadRecordService";
import Link from "next/link";

export default async function AdminUploadsPage() {
  const uploads = await uploadRecordService.getUploads();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Upload Records</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">上传记录</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">查看 Markdown、图片、JSON 等文件的上传记录，也可以从这里上传到本地数据目录。</p>
        <AdminTabs />
        <div className="mt-8">
          <Button asChild>
            <Link href="/admin/uploads/new">上传文件</Link>
          </Button>
        </div>
        <section className="mt-12">
          <UploadRecordList uploads={uploads} />
        </section>
      </main>
    </AdminGuard>
  );
}
