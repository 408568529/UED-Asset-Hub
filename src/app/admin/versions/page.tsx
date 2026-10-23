import { WorkspacePageHeader } from "@/components/layout/WorkspacePageHeader";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { VersionList } from "@/components/admin/VersionList";
import { assetVersionService } from "@/services/assetVersionService";

export default async function AdminVersionsPage() {
  const versions = await assetVersionService.getVersions();

  return (
    <AdminGuard>
      <main><AdminWorkspace>
        <WorkspacePageHeader className="admin-page-header" title="版本记录" description="按资产类型查看历史版本快照。" />
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
