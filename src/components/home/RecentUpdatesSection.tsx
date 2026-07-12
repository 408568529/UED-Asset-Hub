import { Reveal } from "@/components/motion/Reveal";
import type { ComponentSpec } from "@/types/componentSpec";
import type { FontAsset } from "@/types/font";
import type { Product } from "@/types/product";
import type { PromptAsset } from "@/types/prompt";
import type { Skill } from "@/types/skill";
import type { Sop } from "@/types/sop";
import type { TrainingVideo } from "@/types/training";

type UpdateItem = {
  id: string;
  name: string;
  type: string;
  href: string;
  updatedAt: string;
};

export function RecentUpdatesSection({
  products,
  components,
  sops,
  skills,
  fonts,
  prompts,
  training
}: {
  products: Product[];
  components: ComponentSpec[];
  sops: Sop[];
  skills: Skill[];
  fonts: FontAsset[];
  prompts: PromptAsset[];
  training: TrainingVideo[];
}) {
  const updates: UpdateItem[] = [
    ...products.map((product) => ({
      id: product.id,
      name: product.name,
      type: "Vibe Product",
      href: product.link,
      updatedAt: product.updatedAt
    })),
    ...components.map((component) => ({
      id: component.id,
      name: component.name,
      type: "组件规范",
      href: component.docLink,
      updatedAt: component.updatedAt
    })),
    ...sops.map((sop) => ({
      id: sop.id,
      name: sop.name,
      type: "标准 SOP",
      href: sop.docLink,
      updatedAt: sop.updatedAt
    })),
    ...skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      type: "Skill Center",
      href: `/skills/${skill.id}`,
      updatedAt: skill.updatedAt
    })),
    ...fonts.map((font) => ({
      id: font.id,
      name: font.name,
      type: "Font Library",
      href: `/fonts/${font.id}`,
      updatedAt: font.updatedAt
    })),
    ...prompts.map((prompt) => ({
      id: prompt.id,
      name: prompt.name,
      type: "Prompt Library",
      href: `/prompts/${prompt.id}`,
      updatedAt: prompt.updatedAt
    })),
    ...training.map((video) => ({
      id: video.id,
      name: video.title,
      type: "培训资料",
      href: `/training/${video.id}`,
      updatedAt: video.updatedAt
    }))
  ]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 6);

  return (
    <section className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <Reveal>
        <div className="mb-10 border-t border-foreground/[0.1] pt-6 md:mb-14">
          <div className="grid gap-6 md:grid-cols-[160px_1fr]">
            <p className="font-mono text-sm text-muted-foreground">02 — Latest Updates</p>
            <div>
              <h2 className="max-w-4xl text-4xl font-black leading-[1.02] md:text-6xl">最近更新的团队资产</h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
                直接读取本地数据文件，展示最新更新的产品、Skill、字体、Prompt 与规范资产。
              </p>
            </div>
          </div>
        </div>
      </Reveal>
      <div>
        {updates.map((item, index) => (
          <a
            key={`${item.type}-${item.id}`}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="group grid gap-3 border-b border-foreground/[0.08] py-7 transition-colors hover:bg-white/65 md:grid-cols-[64px_1fr_180px_140px] md:items-center"
          >
            <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
            <span className="text-xl font-black transition-transform duration-300 group-hover:translate-x-2 md:text-2xl">{item.name}</span>
            <span className="font-mono text-sm text-muted-foreground">{item.type}</span>
            <span className="font-mono text-sm text-muted-foreground">{item.updatedAt.slice(0, 10)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
