import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { VersionList } from "@/components/admin/VersionList";
import { assetVersionService } from "@/services/assetVersionService";

export default async function AdminVersionsPage() {
  const versions = await assetVersionService.getVersions();

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Versions</p>
        <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">版本记录</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">按资产类型查看每次编辑后生成的版本快照。</p>
        <AdminWorkspace><section className="grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="mb-5 text-3xl font-black">Vibe Product</h2>
            <VersionList versions={versions} assetType="product" />
          </div>
          <div>
            <h2 className="mb-5 text-3xl font-black">组件规范</h2>
            <VersionList versions={versions} assetType="component" />
          </div>
        </section></AdminWorkspace>
      </main>
    </AdminGuard>
  );
}
