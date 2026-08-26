import { knowledgeModuleHrefs, openModules } from "@/config/modules";
import { storageFolders } from "@/config/storage";
import { countStoredEntries } from "@/lib/storage/fileCount";
import { componentSpecService } from "@/services/componentSpecService";
import { fontService } from "@/services/fontService";
import { productService } from "@/services/productService";
import { promptService } from "@/services/promptService";
import { skillService } from "@/services/skillService";
import { sopService } from "@/services/sopService";
import { testEnvironmentService } from "@/services/testEnvironmentService";
import { trainingService } from "@/services/trainingService";
import type { ModuleSummary } from "@/types/module";

export const moduleService = {
  async getOpenModuleSummaries(): Promise<ModuleSummary[]> {
    const [
      productCount,
      componentCount,
      sopCount,
      skillCount,
      fontCount,
      promptCount,
      trainingCount,
      testEnvironmentCount,
      productFileCount,
      componentFileCount,
      sopFileCount,
      skillFileCount,
      fontFileCount,
      promptFileCount
    ] = await Promise.all([
      productService.countProducts(),
      componentSpecService.countComponents(),
      sopService.countSops(),
      skillService.countSkills(),
      fontService.countFonts(),
      promptService.countPrompts(),
      trainingService.countVideos(),
      testEnvironmentService.countEnvironments(),
      countStoredEntries(storageFolders.product),
      countStoredEntries(storageFolders.component),
      countStoredEntries(storageFolders.sop),
      countStoredEntries(storageFolders.skill),
      countStoredEntries(storageFolders.font),
      countStoredEntries(storageFolders.prompt)
    ]);

    return [
      { id: "products", ...openModules.products, href: knowledgeModuleHrefs.products, count: Math.max(productCount, productFileCount) },
      { id: "components", ...openModules.components, href: knowledgeModuleHrefs.components, count: Math.max(componentCount, componentFileCount) },
      { id: "sops", ...openModules.sops, href: knowledgeModuleHrefs.sops, count: Math.max(sopCount, sopFileCount) },
      { id: "skills", ...openModules.skills, href: knowledgeModuleHrefs.skills, count: Math.max(skillCount, skillFileCount) },
      { id: "fonts", ...openModules.fonts, href: knowledgeModuleHrefs.fonts, count: Math.max(fontCount, fontFileCount) },
      { id: "prompts", ...openModules.prompts, href: knowledgeModuleHrefs.prompts, count: Math.max(promptCount, promptFileCount) },
      { id: "training", ...openModules.training, href: knowledgeModuleHrefs.training, count: trainingCount },
      { id: "testEnvironments", ...openModules.testEnvironments, href: knowledgeModuleHrefs.testEnvironments, count: testEnvironmentCount }
    ];
  }
};
