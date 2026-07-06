import { Reveal } from "@/components/motion/Reveal";
import type { ComponentSpec } from "@/types/componentSpec";
import type { Product } from "@/types/product";
import type { Skill } from "@/types/skill";
import type { Sop } from "@/types/sop";

type UpdateItem = {
  id: string;
  name: string;
  type: string;
  href: string;
  updatedAt: string;
};

export function RecentUpdatesSection({ products, components, sops, skills }: { products: Product[]; components: ComponentSpec[]; sops: Sop[]; skills: Skill[] }) {
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
    }))
  ]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 6);

  return (
    <section className="mx-auto max-w-7xl px-5 py-16 md:py-24">
      <Reveal>
        <div className="mb-10 border-t border-foreground/15 pt-6 md:mb-14">
          <div className="grid gap-6 md:grid-cols-[160px_1fr]">
            <p className="font-mono text-sm text-muted-foreground">02 — Latest Updates</p>
            <div>
              <h2 className="max-w-4xl text-4xl font-black leading-[1.02] md:text-6xl">最近更新的团队资产</h2>
              <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground md:text-lg">
                直接读取本地数据文件，展示最新更新的产品与组件规范。
              </p>
            </div>
          </div>
        </div>
      </Reveal>
      <div className="border-t border-foreground/10">
        {updates.map((item) => (
          <a
            key={`${item.type}-${item.id}`}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="grid gap-3 border-b border-foreground/10 py-6 transition hover:bg-white/60 md:grid-cols-[1fr_180px_140px]"
          >
            <span className="text-2xl font-black">{item.name}</span>
            <span className="font-mono text-sm text-muted-foreground">{item.type}</span>
            <span className="font-mono text-sm text-muted-foreground">{item.updatedAt.slice(0, 10)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
