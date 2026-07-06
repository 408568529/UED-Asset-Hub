import { openModules } from "@/config/modules";
import { componentSpecService } from "@/services/componentSpecService";
import { productService } from "@/services/productService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";
import type { ModuleSummary } from "@/types/module";

export const moduleService = {
  async getOpenModuleSummaries(): Promise<ModuleSummary[]> {
    const [productCount, componentCount, sopCount, skillCount] = await Promise.all([
      productService.countProducts(),
      componentSpecService.countComponents(),
      sopService.countSops(),
      skillService.countSkills()
    ]);

    return [
      { id: "products", ...openModules.products, count: productCount },
      { id: "components", ...openModules.components, count: componentCount },
      { id: "sops", ...openModules.sops, count: sopCount },
      { id: "skills", ...openModules.skills, count: skillCount }
    ];
  }
};
