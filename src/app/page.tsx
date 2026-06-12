import { AskUEDBox } from "@/components/ai/AskUEDBox";
import { CategorySection } from "@/components/home/CategorySection";
import { FeaturedSection } from "@/components/home/FeaturedSection";
import { HeroSection } from "@/components/home/HeroSection";
import { SectionHeader } from "@/components/home/SectionHeader";
import { TopicSection } from "@/components/home/TopicSection";
import { assetService } from "@/services/assetService";
import { topicService } from "@/services/topicService";

export default async function HomePage() {
  const [popularAssets, latestAssets, topics] = await Promise.all([
    assetService.getAssets({ sort: "popular", limit: 6 }),
    assetService.getAssets({ sort: "latest", limit: 6 }),
    topicService.getTopics()
  ]);

  return (
    <>
      <HeroSection />
      <CategorySection />
      <TopicSection index="02" topics={topics} />
      <FeaturedSection
        index="03"
        eyebrow="Popular Assets"
        title="Most Saved References"
        description="高浏览、高收藏的资产会优先出现在这里，方便快速找到团队共识。"
        assets={popularAssets}
      />
      <FeaturedSection
        index="04"
        eyebrow="Latest Updates"
        title="Fresh From The Team"
        description="按更新时间排序，适合关注最近新增的规范、项目和 Prompt。"
        assets={latestAssets}
      />
      <section className="brand-container py-16 md:py-24">
        <SectionHeader
          index="05"
          eyebrow="Ask UED"
          title="Search The Team Memory"
          description="用自然语言询问团队资产，把项目经验、组件规范和 Prompt 模板串联起来。"
        />
        <AskUEDBox />
      </section>
    </>
  );
}
