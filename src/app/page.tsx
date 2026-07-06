import { AssetCategoriesSection } from "@/components/home/AssetCategoriesSection";
import { HeroSection } from "@/components/home/HeroSection";
import { RecentUpdatesSection } from "@/components/home/RecentUpdatesSection";
import { componentSpecService } from "@/services/componentSpecService";
import { moduleService } from "@/services/moduleService";
import { productService } from "@/services/productService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";

export default async function HomePage() {
  const [modules, products, components, sops, skills] = await Promise.all([
    moduleService.getOpenModuleSummaries(),
    productService.getProducts(),
    componentSpecService.getComponents(),
    sopService.getSops(),
    skillService.getSkills()
  ]);

  return (
    <>
      <HeroSection modules={modules} />
      <AssetCategoriesSection modules={modules} />
      <RecentUpdatesSection products={products} components={components} sops={sops} skills={skills} />
    </>
  );
}
