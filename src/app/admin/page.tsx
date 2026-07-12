import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminList } from "@/components/admin/AdminList";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminToolbar } from "@/components/admin/AdminToolbar";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
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
import { trainingService } from "@/services/trainingService";

function formatRelativeTime(value?: string) {
  if (!value) return "--";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (elapsedMinutes < 60) return `${Math.max(1, elapsedMinutes)}m`;
  if (elapsedMinutes < 1_440) return `${Math.floor(elapsedMinutes / 60)}h`;
  if (elapsedMinutes < 10_080) return `${Math.floor(elapsedMinutes / 1_440)}d`;
  return value.slice(0, 10);
}

export default async function AdminPage() {
  const [products, components, sops, skills, fonts, prompts, training] = await Promise.all([
    productService.getProducts(),
    componentSpecService.getComponents(),
    sopService.getSops(),
    skillService.getSkills(),
    fontService.getFonts(),
    promptService.getPrompts(),
    trainingService.getVideos()
  ]);
  const recentData = await Promise.allSettled([
    operationLogService.getLogs(3),
    uploadRecordService.getUploads(3),
    assetVersionService.getVersions()
  ]);
  const [logsResult, uploadsResult, versionsResult] = recentData;
  const logs = logsResult.status === "fulfilled" ? logsResult.value : [];
  const uploads = uploadsResult.status === "fulfilled" ? uploadsResult.value : [];
  const versions = versionsResult.status === "fulfilled" ? versionsResult.value : [];
  const recentDataUnavailable = recentData.some((result) => result.status === "rejected");
  const managedAssets = [...products, ...components, ...sops, ...skills, ...fonts, ...prompts, ...training];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const latestUpdatedAt = managedAssets.reduce<string | undefined>((latest, asset) => !latest || new Date(asset.updatedAt).getTime() > new Date(latest).getTime() ? asset.updatedAt : latest, undefined);

  recentData.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`[admin] Failed to load recent data source ${index + 1}:`, result.reason);
    }
  });

  return (
    <AdminGuard>
      <main className="mx-auto max-w-7xl px-5 py-14 md:py-20">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Admin</p>
            <h1 className="mt-6 max-w-4xl text-3xl font-black leading-tight">资产管理台</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              管理团队内容资产，并进入培训资料与测试环境专属工作区。普通列表页负责浏览，编辑和删除集中在管理台。
            </p>
          </div>
          <AdminToolbar />
        </div>
        <AdminWorkspace>
          <AdminOverview
            assetTotal={managedAssets.length}
            monthlyNewCount={managedAssets.filter((asset) => new Date(asset.createdAt).getTime() >= monthStart.getTime()).length}
            lastUpdatedLabel={formatRelativeTime(latestUpdatedAt)}
          />
          {recentDataUnavailable ? (
            <p className="mt-8 border border-foreground/15 bg-white px-5 py-4 text-sm text-muted-foreground">
              部分近期记录暂时无法读取，请检查服务器数据文件。资产管理功能仍可继续使用。
            </p>
          ) : null}
          <div className="mt-12">
            <h2 className="mb-5 text-3xl font-black">资产列表</h2>
            <AdminList
              products={products}
              components={components}
              sops={sops}
              skills={skills}
              fonts={fonts}
              prompts={prompts}
              categoryCounts={{ product: products.length, component: components.length, sop: sops.length, skill: skills.length, font: fonts.length, prompt: prompts.length }}
            >
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
        </AdminWorkspace>
      </main>
    </AdminGuard>
  );
}
