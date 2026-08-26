import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
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
  external?: boolean;
  updatedAt: string;
};

export function RecentUpdatesSection({
  products,
  components,
  sops,
  skills,
  fonts,
  prompts,
  training,
  tone = "light"
}: {
  products: Product[];
  components: ComponentSpec[];
  sops: Sop[];
  skills: Skill[];
  fonts: FontAsset[];
  prompts: PromptAsset[];
  training: TrainingVideo[];
  tone?: "light" | "dark";
}) {
  const isDark = tone === "dark";
  const updates: UpdateItem[] = [
    ...products.map((product) => ({
      id: product.id,
      name: product.name,
      type: "Vibe Product",
      href: product.link,
      external: true,
      updatedAt: product.updatedAt
    })),
    ...components.map((component) => ({
      id: component.id,
      name: component.name,
      type: "组件规范",
      href: component.docLink,
      external: true,
      updatedAt: component.updatedAt
    })),
    ...sops.map((sop) => ({
      id: sop.id,
      name: sop.name,
      type: "标准 SOP",
      href: sop.docLink,
      external: true,
      updatedAt: sop.updatedAt
    })),
    ...skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      type: "Skill Center",
      href: `/knowledge?section=ai&type=skill&asset=skill:${encodeURIComponent(skill.id)}`,
      updatedAt: skill.updatedAt
    })),
    ...fonts.map((font) => ({
      id: font.id,
      name: font.name,
      type: "Font Library",
      href: `/knowledge?section=resource&type=font&asset=font:${encodeURIComponent(font.id)}`,
      updatedAt: font.updatedAt
    })),
    ...prompts.map((prompt) => ({
      id: prompt.id,
      name: prompt.name,
      type: "Prompt Library",
      href: `/knowledge?section=ai&type=prompt&asset=prompt:${encodeURIComponent(prompt.id)}`,
      updatedAt: prompt.updatedAt
    })),
    ...training.map((video) => ({
      id: video.id,
      name: video.title,
      type: "培训资料",
      href: `/knowledge?section=training&asset=training:${encodeURIComponent(video.id)}`,
      updatedAt: video.updatedAt
    }))
  ]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 6);

  return (
    <section className={isDark ? "bg-[#080b0a] text-[#eef1e8]" : ""}>
      <div className="page-shell py-16 md:py-20">
      <Reveal>
        <div className={`mb-8 grid gap-6 border-t pt-6 md:grid-cols-[10rem_1fr] md:items-end ${isDark ? "border-white/15" : "border-border"}`}>
            <p className={isDark ? "font-mono text-[11px] uppercase tracking-[0.2em] text-white/44" : "section-kicker"}>Latest updates / 01</p>
            <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <h2 className="section-title max-w-4xl">最近更新</h2>
                <p className={`mt-3 max-w-2xl text-sm leading-7 md:text-base ${isDark ? "text-white/56" : "text-muted-foreground"}`}>
                直接读取本地数据文件，展示最新更新的产品、Skill、字体、Prompt 与规范资产。
                </p>
              </div>
              <Link href="/search" className={`inline-flex items-center gap-2 text-sm font-bold transition ${isDark ? "hover:text-[#b7f52b]" : "hover:text-muted-foreground"}`}>查看全部 <ArrowRight size={15} /></Link>
            </div>
        </div>
      </Reveal>
      <div className={isDark ? "border-y border-white/15" : "library-list"}>
        {updates.map((item, index) => (
          <UpdateLink key={`${item.type}-${item.id}`} item={item} className={`group grid gap-3 px-4 py-5 transition-colors md:grid-cols-[3.5rem_1fr_10rem_8rem_2rem] md:items-center md:px-6 ${isDark ? "border-b border-white/12 last:border-b-0 hover:bg-white/[0.045]" : "library-row"}`}>
            <span className={`font-mono text-xs ${isDark ? "text-white/42" : "text-muted-foreground"}`}>{String(index + 1).padStart(2, "0")}</span>
            <span className="text-lg font-black transition-transform duration-200 group-hover:translate-x-1 md:text-xl">{item.name}</span>
            <span className={`font-mono text-xs ${isDark ? "text-white/42" : "text-muted-foreground"}`}>{item.type}</span>
            <span className={`font-mono text-xs tabular-nums ${isDark ? "text-white/42" : "text-muted-foreground"}`}>{item.updatedAt.slice(0, 10)}</span>
            <ArrowUpRight size={16} className={`hidden transition md:block ${isDark ? "text-white/42 group-hover:text-[#b7f52b]" : "text-muted-foreground group-hover:text-foreground"}`} />
          </UpdateLink>
        ))}
        {!updates.length ? (
          <div className={`grid min-h-40 place-items-center border-b px-5 py-10 text-center ${isDark ? "border-white/15" : "border-border"}`}>
            <div><p className="font-bold">还没有最近更新</p><p className={`mt-2 text-sm ${isDark ? "text-white/56" : "text-muted-foreground"}`}>新建或更新资产后会自动出现在这里。</p></div>
          </div>
        ) : null}
      </div>
      </div>
    </section>
  );
}

function UpdateLink({ item, className, children }: { item: UpdateItem; className: string; children: React.ReactNode }) {
  return item.external
    ? <a href={item.href} target="_blank" rel="noreferrer" className={className}>{children}</a>
    : <Link href={item.href} className={className}>{children}</Link>;
}
