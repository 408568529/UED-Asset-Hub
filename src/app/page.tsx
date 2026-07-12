import { AssetCategoriesSection } from "@/components/home/AssetCategoriesSection";
import { HeroSection } from "@/components/home/HeroSection";
import { RecentUpdatesSection } from "@/components/home/RecentUpdatesSection";
import { componentSpecService } from "@/services/componentSpecService";
import { fontService } from "@/services/fontService";
import { moduleService } from "@/services/moduleService";
import { productService } from "@/services/productService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";
import { trainingService } from "@/services/trainingService";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [modules, products, components, sops, skills, fonts, prompts, training] = await Promise.all([
    moduleService.getOpenModuleSummaries(),
    productService.getProducts(),
    componentSpecService.getComponents(),
    sopService.getSops(),
    skillService.getSkills(),
    fontService.getFonts(),
    promptService.getPrompts(),
    trainingService.getVideos()
  ]);

  return (
    <>
      <HeroSection modules={modules} />
      <AssetCategoriesSection modules={modules} />
      <RecentUpdatesSection products={products} components={components} sops={sops} skills={skills} fonts={fonts} prompts={prompts} training={training} />
    </>
  );
}
