import { openModules } from "@/config/modules";
import { componentSpecService } from "@/services/componentSpecService";
import { fontService } from "@/services/fontService";
import { productService } from "@/services/productService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";
import type { ModuleSummary } from "@/types/module";

export const moduleService = {
  async getOpenModuleSummaries(): Promise<ModuleSummary[]> {
    const [productCount, componentCount, sopCount, skillCount, fontCount, promptCount] = await Promise.all([
      productService.countProducts(),
      componentSpecService.countComponents(),
      sopService.countSops(),
      skillService.countSkills(),
      fontService.countFonts(),
      promptService.countPrompts()
    ]);

    return [
      { id: "products", ...openModules.products, count: productCount },
      { id: "components", ...openModules.components, count: componentCount },
      { id: "sops", ...openModules.sops, count: sopCount },
      { id: "skills", ...openModules.skills, count: skillCount },
      { id: "fonts", ...openModules.fonts, count: fontCount },
      { id: "prompts", ...openModules.prompts, count: promptCount }
    ];
  }
};
