import { notFound } from "next/navigation";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { assetVersionService } from "@/services/assetVersionService";

export default async function VersionDetailPage({ params }: { params: Promise<{ id: string; versionId: string }> }) {
  const { id, versionId } = await params;
  const version = await assetVersionService.getVersionById(versionId);
  if (!version || version.assetId !== decodeURIComponent(id)) notFound();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Version Detail</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">{version.title} {version.version}</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
          {version.assetType} · {version.operator} · {version.createdAt}
        </p>
        <AdminWorkspace><section className="grid gap-10 lg:grid-cols-[360px_1fr]">
          <div>
            <h2 className="text-2xl font-black">修改摘要</h2>
            <ul className="mt-5 space-y-2 text-sm leading-6">
              {version.changeSummary.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-black">内容快照</h2>
            <pre className="mt-5 overflow-auto rounded-2xl bg-foreground p-5 text-xs leading-6 text-white">
              {version.contentSnapshot}
            </pre>
          </div>
        </section></AdminWorkspace>
      </main>
    </AdminGuard>
  );
}
