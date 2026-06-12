import { AssetGrid } from "@/components/asset/AssetGrid";
import { Badge } from "@/components/ui/badge";
import { assetService } from "@/services/assetService";

export default async function MePage() {
  const [mine, saved, history] = await Promise.all([
    assetService.getAssets({ limit: 3 }),
    assetService.getAssets({ sort: "saved", limit: 3 }),
    assetService.getAssets({ sort: "popular", limit: 3 })
  ]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-12">
      <section className="mb-10 rounded-[2rem] bg-white p-8 shadow-card">
        <Badge>Profile</Badge>
        <h1 className="mt-4 text-5xl font-black">我的资产空间</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">后续接入登录后，这里会展示真实用户资料、发布、收藏、草稿箱和浏览历史。</p>
      </section>

      <div className="space-y-12">
        <section>
          <h2 className="mb-5 text-3xl font-black">我的发布</h2>
          <AssetGrid assets={mine} />
        </section>
        <section>
          <h2 className="mb-5 text-3xl font-black">我的收藏</h2>
          <AssetGrid assets={saved} />
        </section>
        <section className="grid gap-6 md:grid-cols-2">
          <div className="rounded-[1.5rem] bg-white p-6 shadow-card">
            <h2 className="text-2xl font-bold">草稿箱</h2>
            <p className="mt-2 text-sm text-muted-foreground">3 篇草稿等待补充封面、标签和 AI 摘要。</p>
          </div>
          <div className="rounded-[1.5rem] bg-white p-6 shadow-card">
            <h2 className="text-2xl font-bold">浏览历史</h2>
            <p className="mt-2 text-sm text-muted-foreground">最近浏览：{history.map((asset) => asset.title).join("、")}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
