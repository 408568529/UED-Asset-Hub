import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminList } from "@/components/admin/AdminList";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminToolbar } from "@/components/admin/AdminToolbar";
import { OperationLogList } from "@/components/admin/OperationLogList";
import { RecentVersionList } from "@/components/admin/RecentVersionList";
import { UploadRecordList } from "@/components/admin/UploadRecordList";
import { assetVersionService } from "@/services/assetVersionService";
import { componentSpecService } from "@/services/componentSpecService";
import { fontService } from "@/services/fontService";
import { operationLogService } from "@/services/operationLogService";
import { productService } from "@/services/productService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";
import { uploadRecordService } from "@/services/uploadRecordService";

export default async function AdminPage() {
  const [products, components, sops, skills, fonts, prompts, logs, uploads, versions] = await Promise.all([
    productService.getProducts(),
    componentSpecService.getComponents(),
    sopService.getSops(),
    skillService.getSkills(),
    fontService.getFonts(),
    promptService.getPrompts(),
    operationLogService.getLogs(3),
    uploadRecordService.getUploads(3),
    assetVersionService.getVersions()
  ]);

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Admin</p>
            <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">资产管理台</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              管理 Vibe Product、Skill Center、Font Library、Prompt Library、组件规范和标准 SOP。普通列表页只负责浏览，编辑和删除集中在这里。
            </p>
          </div>
          <AdminToolbar />
        </div>
        <AdminOverview
          productCount={products.length}
          componentCount={components.length}
          sopCount={sops.length}
          skillCount={skills.length}
          fontCount={fonts.length}
          promptCount={prompts.length}
        />
        <AdminTabs />
        <div className="mt-12">
          <h2 className="mb-5 text-3xl font-black">资产列表</h2>
          <AdminList products={products} components={components} sops={sops} skills={skills} fonts={fonts} prompts={prompts}>
            <section className="mt-16 grid gap-10 lg:grid-cols-3">
              <div>
                <h2 className="mb-5 text-2xl font-black">最近更新</h2>
                <OperationLogList logs={logs} />
              </div>
              <div>
                <h2 className="mb-5 text-2xl font-black">最近上传</h2>
                <UploadRecordList uploads={uploads} />
              </div>
              <div>
                <h2 className="mb-5 text-2xl font-black">最近版本</h2>
                <RecentVersionList versions={versions.slice(0, 3)} />
              </div>
            </section>
          </AdminList>
        </div>
      </main>
    </AdminGuard>
  );
}
