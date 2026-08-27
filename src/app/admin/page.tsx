import { AdminGuard } from "@/components/admin/AdminGuard";
import { AdminList } from "@/components/admin/AdminList";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AdminToolbar } from "@/components/admin/AdminToolbar";
import { AdminWorkspace } from "@/components/admin/AdminWorkspace";
import { componentSpecService } from "@/services/componentSpecService";
import { fontService } from "@/services/fontService";
import { productService } from "@/services/productService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";
import { trainingService } from "@/services/trainingService";
import { markdownKnowledgeService } from "@/services/markdownKnowledgeService";

function formatRelativeTime(value?: string) {
  if (!value) return "--";
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (elapsedMinutes < 60) return `${Math.max(1, elapsedMinutes)}m`;
  if (elapsedMinutes < 1_440) return `${Math.floor(elapsedMinutes / 60)}h`;
  if (elapsedMinutes < 10_080) return `${Math.floor(elapsedMinutes / 1_440)}d`;
  return value.slice(0, 10);
}

export default async function AdminPage() {
  const [markdownKnowledgeResult, products, components, sops, skills, fonts, prompts, training] = await Promise.all([
    markdownKnowledgeService.list().catch(() => ({ documents: [], diagnostics: [] })),
    productService.getProducts(),
    componentSpecService.getComponents(),
    sopService.getSops(),
    skillService.getSkills(),
    fontService.getFonts(),
    promptService.getPrompts(),
    trainingService.getVideos()
  ]);
  const markdownKnowledge = markdownKnowledgeResult.documents;
  const managedAssets = [...markdownKnowledge, ...products, ...components, ...sops, ...skills, ...fonts, ...prompts, ...training];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const latestUpdatedAt = managedAssets.reduce<string | undefined>((latest, asset) => !latest || new Date(asset.updatedAt).getTime() > new Date(latest).getTime() ? asset.updatedAt : latest, undefined);

  return (
    <AdminGuard>
      <main>
        <AdminWorkspace>
          <header className="admin-page-header"><div><h1 className="text-lg font-black tracking-[-0.02em]">内容管理</h1><p className="mt-0.5 text-xs text-muted-foreground">浏览、筛选与维护团队内容资产</p></div><AdminToolbar /></header>
          <AdminOverview assetTotal={managedAssets.length} monthlyNewCount={managedAssets.filter((asset) => new Date(asset.createdAt).getTime() >= monthStart.getTime()).length} lastUpdatedLabel={formatRelativeTime(latestUpdatedAt)} />
          <div className="admin-page-content">
            <AdminList
              markdownKnowledge={markdownKnowledge}
              products={products}
              components={components}
              sops={sops}
              skills={skills}
              fonts={fonts}
              prompts={prompts}
              training={training}
              categoryCounts={{
                knowledge: markdownKnowledge.filter((item) => item.documentType === "knowledge").length,
                project: markdownKnowledge.filter((item) => item.documentType === "project").length,
                "micro-spec": markdownKnowledge.filter((item) => item.documentType === "micro-spec").length,
                product: products.length,
                component: components.length,
                sop: sops.length,
                skill: skills.length,
                font: fonts.length,
                prompt: prompts.length,
                training: training.length
              }}
            />
          </div>
        </AdminWorkspace>
      </main>
    </AdminGuard>
  );
}
