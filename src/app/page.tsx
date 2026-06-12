import { AskUEDBox } from "@/components/ai/AskUEDBox";
import { FeaturedSection } from "@/components/home/FeaturedSection";
import { HeroSection } from "@/components/home/HeroSection";
import { TopicSection } from "@/components/home/TopicSection";
import { assetService } from "@/services/assetService";
import { topicService } from "@/services/topicService";

export default async function HomePage() {
  const [featuredAssets, popularAssets, latestAssets, topics] = await Promise.all([
    assetService.getFeaturedAssets(),
    assetService.getAssets({ sort: "popular", limit: 6 }),
    assetService.getAssets({ sort: "latest", limit: 6 }),
    topicService.getTopics()
  ]);

  return (
    <>
      <HeroSection />
      <FeaturedSection title="推荐内容" description="团队近期最值得阅读的设计沉淀、规范和 AI 工作流。" assets={featuredAssets} />
      <section className="mx-auto max-w-7xl px-5 py-10">
        <AskUEDBox />
      </section>
      <FeaturedSection title="热门资产" description="高浏览、高收藏的资产会优先出现在这里，方便快速找到团队共识。" assets={popularAssets} />
      <TopicSection topics={topics} />
      <FeaturedSection title="最新更新" description="按更新时间排序，适合关注最近新增的规范、项目和 Prompt。" assets={latestAssets} />
    </>
  );
}
