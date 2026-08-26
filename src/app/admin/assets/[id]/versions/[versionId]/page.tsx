import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminPageFrame } from "@/components/admin/AdminPageFrame";
import { assetVersionService } from "@/services/assetVersionService";

export default async function VersionDetailPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  const version = await assetVersionService.getVersionById(versionId);
  if (!version || version.assetId !== decodeURIComponent(id)) notFound();

  return (
    <AdminGuard>
      <AdminPageFrame title={`${version.title} ${version.version}`} description={`${version.assetType} · ${version.operator} · ${version.createdAt}`}><section className="grid gap-8 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <div>
            <h2 className="text-base font-black">修改摘要</h2>
            <ul className="mt-4 space-y-2 text-sm leading-6">
              {version.changeSummary.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-base font-black">内容快照</h2>
            <pre className="mt-4 overflow-auto bg-foreground p-5 text-xs leading-6 text-white">
              {version.contentSnapshot}
            </pre>
          </div>
        </section></AdminPageFrame>
    </AdminGuard>
  );
}
