"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DeleteConfirmDialog } from "@/components/admin/DeleteConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ComponentSpec } from "@/types/componentSpec";
import type { FontAsset } from "@/types/font";
import type { Product } from "@/types/product";
import type { PromptAsset } from "@/types/prompt";
import type { Skill } from "@/types/skill";
import type { Sop } from "@/types/sop";
import type { TrainingVideo } from "@/types/training";
import type { MarkdownKnowledgeMetadata } from "@/types/markdownKnowledge";

type Category = "all" | "knowledge" | "project" | "micro-spec" | "product" | "skill" | "font" | "prompt" | "component" | "sop" | "training";
type SortMode = "latest" | "created" | "title";
type CategoryCounts = Record<Exclude<Category, "all">, number>;

type AdminAssetRow = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  category: Exclude<Category, "all">;
  categoryLabel: string;
  updatedAt: string;
  createdAt: string;
  viewHref: string;
  editHref: string;
  deleteApi?: string;
  meta?: string;
};

const filters: { id: Category; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "knowledge", label: "知识文章" },
  { id: "project", label: "项目沉淀" },
  { id: "micro-spec", label: "微规范" },
  { id: "product", label: "Vibe Product" },
  { id: "skill", label: "Skill Center" },
  { id: "font", label: "Font Library" },
  { id: "prompt", label: "Prompt Library" },
  { id: "component", label: "组件规范" },
  { id: "sop", label: "标准 SOP" },
  { id: "training", label: "培训资料" }
];

function toRows(markdownKnowledge: MarkdownKnowledgeMetadata[], products: Product[], components: ComponentSpec[], sops: Sop[], skills: Skill[], fonts: FontAsset[], prompts: PromptAsset[], training: TrainingVideo[]): AdminAssetRow[] {
  return [
    ...markdownKnowledge.map((document) => ({
      id: document.id,
      title: document.title,
      description: document.description,
      tags: document.tags,
      category: document.documentType,
      categoryLabel: document.documentType === "micro-spec" ? "微规范" : document.documentType === "project" ? "项目沉淀" : "知识文章",
      updatedAt: document.updatedAt,
      createdAt: document.createdAt,
      viewHref: `/knowledge?asset=${encodeURIComponent(`${document.documentType}:${document.id}`)}`,
      editHref: `/admin/knowledge/${encodeURIComponent(document.id)}/edit`,
      meta: document.documentType === "micro-spec" ? `Topic：${document.specTopic} · Scope：${document.relatedScopes.join(", ")}` : undefined
    })),
    ...products.map((product) => ({
      id: product.id,
      title: product.name,
      description: product.description,
      tags: product.tags ?? [],
      category: "product" as const,
      categoryLabel: "Vibe Product",
      updatedAt: product.updatedAt,
      createdAt: product.createdAt,
      viewHref: product.link,
      editHref: `/admin/products/${product.id}`,
      deleteApi: `/api/products/${product.id}`
    })),
    ...components.map((component) => ({
      id: component.id,
      title: component.name,
      description: component.description,
      tags: component.tags ?? [],
      category: "component" as const,
      categoryLabel: "组件规范",
      updatedAt: component.updatedAt,
      createdAt: component.createdAt,
      viewHref: component.docLink,
      editHref: `/admin/components/${component.id}`,
      deleteApi: `/api/components/${component.id}`
    })),
    ...sops.map((sop) => ({
      id: sop.id,
      title: sop.name,
      description: sop.description,
      tags: sop.tags ?? [],
      category: "sop" as const,
      categoryLabel: "标准 SOP",
      updatedAt: sop.updatedAt,
      createdAt: sop.createdAt,
      viewHref: sop.docLink,
      editHref: `/admin/sops/${sop.id}`,
      deleteApi: `/api/sops/${sop.id}`
    })),
    ...skills.map((skill) => ({
      id: skill.id,
      title: skill.name,
      description: skill.description,
      tags: [...skill.tags, ...skill.usageScenarios],
      category: "skill" as const,
      categoryLabel: "Skill Center",
      updatedAt: skill.updatedAt,
      createdAt: skill.createdAt,
      viewHref: `/skills/${skill.id}`,
      editHref: `/admin/skills/${skill.id}`,
      deleteApi: `/api/skills/${skill.id}`,
      meta: `作者：${skill.authorName} · 上传人：${skill.uploadedBy}`
    })),
    ...fonts.map((font) => ({
      id: font.id,
      title: font.name,
      description: font.description,
      tags: font.tags,
      category: "font" as const,
      categoryLabel: "Font Library",
      updatedAt: font.updatedAt,
      createdAt: font.createdAt,
      viewHref: `/fonts/${font.id}`,
      editHref: `/admin/fonts/${font.id}`,
      deleteApi: `/api/fonts/${font.id}`
    })),
    ...prompts.map((prompt) => ({
      id: prompt.id,
      title: prompt.name,
      description: prompt.summary,
      tags: prompt.tags,
      category: "prompt" as const,
      categoryLabel: "Prompt Library",
      updatedAt: prompt.updatedAt,
      createdAt: prompt.createdAt,
      viewHref: `/prompts/${prompt.id}`,
      editHref: `/admin/prompts/${prompt.id}`,
      deleteApi: `/api/prompts/${prompt.id}`
    })),
    ...training.map((video) => ({
      id: video.id,
      title: video.title,
      description: video.description ?? "",
      tags: video.tags,
      category: "training" as const,
      categoryLabel: "培训资料",
      updatedAt: video.updatedAt,
      createdAt: video.createdAt,
      viewHref: `/training/${video.id}`,
      editHref: "/admin/training",
      deleteApi: undefined,
      meta: `${video.groupName}${video.speaker ? ` · ${video.speaker}` : ""}`
    }))
  ];
}

export function AdminList({
  markdownKnowledge,
  products,
  components,
  sops,
  skills,
  fonts,
  prompts,
  training,
  categoryCounts,
  children
}: {
  markdownKnowledge: MarkdownKnowledgeMetadata[];
  products: Product[];
  components: ComponentSpec[];
  sops: Sop[];
  skills: Skill[];
  fonts: FontAsset[];
  prompts: PromptAsset[];
  training: TrainingVideo[];
  categoryCounts: CategoryCounts;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [keyword, setKeyword] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [deleteTarget, setDeleteTarget] = useState<AdminAssetRow | null>(null);

  const rows = useMemo(() => {
    const lowerKeyword = keyword.trim().toLowerCase();
    return toRows(markdownKnowledge, products, components, sops, skills, fonts, prompts, training)
      .filter((row) => (category === "all" ? true : row.category === category))
      .filter((row) => {
        if (!lowerKeyword) return true;
        return `${row.title} ${row.description} ${row.tags.join(" ")}`.toLowerCase().includes(lowerKeyword);
      })
      .sort((a, b) => {
        if (sortMode === "title") return a.title.localeCompare(b.title);
        if (sortMode === "created") return +new Date(a.createdAt || 0) - +new Date(b.createdAt || 0);
        return +new Date(b.updatedAt || 0) - +new Date(a.updatedAt || 0);
      });
  }, [category, components, fonts, keyword, markdownKnowledge, products, prompts, skills, sops, sortMode, training]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (!deleteTarget.deleteApi) return;
    const response = await fetch(deleteTarget.deleteApi, { method: "DELETE" });
    const result = (await response.json()) as { warning?: string };
    setMessage(result.warning ?? "");
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-7">
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <TabsList>
          {filters.map((filter) => (
            <TabsTrigger
              key={filter.id}
              onClick={() => setCategory(filter.id)}
              active={category === filter.id}
            >
              {filter.label}
              {filter.id === "all" || categoryCounts[filter.id] ? <span className="font-mono text-xs font-normal text-muted-foreground">{filter.id === "all" ? Object.values(categoryCounts).reduce((total, count) => total + count, 0) : categoryCounts[filter.id]}</span> : null}
            </TabsTrigger>
          ))}
          </TabsList>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem]">
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索资产名称 / 介绍 / 标签"
          />
          <Select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
          >
            <option value="latest">最新更新</option>
            <option value="created">最早创建</option>
            <option value="title">标题 A-Z</option>
          </Select>
        </div>
      </div>

      {message ? <p className="mb-4 text-sm text-red-600">{message}</p> : null}

      <div className="border border-border bg-[hsl(var(--surface-raised))]">
        <div className="hidden border-b border-border bg-[hsl(var(--surface-subtle)/0.46)] px-5 py-3 md:grid md:grid-cols-[minmax(0,1fr)_8.5rem_7.5rem_10rem] md:items-center md:gap-5">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">资产</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">类型</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">更新</span>
          <span className="text-right font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">操作</span>
        </div>
        {rows.map((row) => (
          <article key={`${row.category}-${row.id}`} className="group relative grid gap-4 border-b border-border px-5 py-5 transition-colors last:border-b-0 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:origin-bottom before:scale-y-0 before:bg-primary before:transition-transform hover:bg-[hsl(var(--surface-subtle)/0.35)] hover:before:scale-y-100 md:grid-cols-[minmax(0,1fr)_8.5rem_7.5rem_10rem] md:items-center md:gap-5">
            <div>
              <h3 className="text-lg font-black leading-tight tracking-[-0.02em] md:text-xl">{row.title}</h3>
              <p className="mt-1.5 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground">{row.description}</p>
              {row.meta ? <p className="mt-2 font-mono text-xs text-muted-foreground">{row.meta}</p> : null}
            </div>
            <p><span className="inline-flex border border-border bg-[hsl(var(--surface-subtle))] px-2 py-1 font-mono text-[10px] text-muted-foreground">{row.categoryLabel}</span></p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">{row.updatedAt.slice(0, 10)}</p>
            <div className="flex gap-3 text-sm md:justify-end md:opacity-45 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
              <a href={row.viewHref} target="_blank" rel="noreferrer" className="font-bold underline">查看</a>
              <Link href={row.editHref} className="font-bold underline">编辑</Link>
              {row.deleteApi ? <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(row)} className="h-auto px-0 font-bold text-destructive underline hover:bg-transparent hover:text-destructive">删除</Button> : null}
            </div>
          </article>
        ))}
      </div>

      {!rows.length ? <p className="border-b border-foreground/10 py-8 text-sm text-muted-foreground">没有符合条件的资产。</p> : null}

      {deleteTarget ? (
        <DeleteConfirmDialog assetName={deleteTarget.title} onCancel={() => setDeleteTarget(null)} onConfirm={confirmDelete} />
      ) : null}

      {category === "all" ? children : null}
    </section>
  );
}
