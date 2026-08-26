import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { VersionList } from "@/components/admin/VersionList";
import { assetVersionService } from "@/services/assetVersionService";

export default async function AdminVersionsPage() {
  const versions = await assetVersionService.getVersions();

  return (
    <AdminGuard>
      <main><AdminWorkspace>
        <header className="admin-page-header"><div><h1 className="text-lg font-black tracking-[-0.02em]">版本记录</h1><p className="mt-0.5 text-xs text-muted-foreground">按资产类型查看历史版本快照。</p></div></header>
        <section className="admin-page-content grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="mb-4 text-base font-black">Vibe Product</h2>
            <VersionList versions={versions} assetType="product" />
          </div>
          <div>
            <h2 className="mb-4 text-base font-black">组件规范</h2>
            <VersionList versions={versions} assetType="component" />
          </div>
        </section>
      </AdminWorkspace></main>
    </AdminGuard>
  );
}
