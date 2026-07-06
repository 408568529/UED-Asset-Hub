"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DeleteConfirmDialog } from "@/components/admin/DeleteConfirmDialog";
import { getAdminPassword } from "@/lib/adminSession";
import type { ComponentSpec } from "@/types/componentSpec";
import type { Product } from "@/types/product";
import type { Skill } from "@/types/skill";
import type { Sop } from "@/types/sop";

type Category = "all" | "product" | "skill" | "component" | "sop";
type SortMode = "latest" | "created" | "title";

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
  deleteApi: string;
};

const filters: { id: Category; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "product", label: "Vibe Product" },
  { id: "skill", label: "Skill Center" },
  { id: "component", label: "组件规范" },
  { id: "sop", label: "标准 SOP" }
];

function toRows(products: Product[], components: ComponentSpec[], sops: Sop[], skills: Skill[]): AdminAssetRow[] {
  return [
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
      tags: skill.tags,
      category: "skill" as const,
      categoryLabel: "Skill Center",
      updatedAt: skill.updatedAt,
      createdAt: skill.createdAt,
      viewHref: `/skills/${skill.id}`,
      editHref: `/admin/skills/${skill.id}`,
      deleteApi: `/api/skills/${skill.id}`
    }))
  ];
}

export function AdminList({
  products,
  components,
  sops,
  skills,
  children
}: {
  products: Product[];
  components: ComponentSpec[];
  sops: Sop[];
  skills: Skill[];
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
    return toRows(products, components, sops, skills)
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
  }, [category, components, keyword, products, skills, sops, sortMode]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const response = await fetch(deleteTarget.deleteApi, { method: "DELETE", headers: { "x-admin-password": getAdminPassword() } });
    const result = (await response.json()) as { warning?: string };
    setMessage(result.warning ?? "");
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <section>
      <div className="mb-8 border-t border-foreground/10 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setCategory(filter.id)}
              className={`border px-4 py-2 text-sm font-bold transition ${
                category === filter.id ? "border-foreground bg-foreground text-white" : "border-foreground/10 text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_180px]">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索资产名称 / 介绍 / 标签"
            className="h-11 border border-foreground/10 bg-white px-4 text-sm outline-none focus:border-foreground"
          />
          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-11 border border-foreground/10 bg-white px-4 text-sm outline-none focus:border-foreground"
          >
            <option value="latest">最新更新</option>
            <option value="created">最早创建</option>
            <option value="title">标题 A-Z</option>
          </select>
        </div>
      </div>

      {message ? <p className="mb-4 text-sm text-red-600">{message}</p> : null}

      <div className="border-t border-foreground/10">
        {rows.map((row) => (
          <article key={`${row.category}-${row.id}`} className="group grid gap-4 border-b border-foreground/10 py-6 transition hover:bg-white/60 md:grid-cols-[1fr_150px_120px_160px] md:items-center">
            <div>
              <h3 className="text-2xl font-black leading-tight">{row.title}</h3>
              <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground">{row.description}</p>
            </div>
            <p className="font-mono text-xs text-muted-foreground">{row.categoryLabel}</p>
            <p className="font-mono text-xs text-muted-foreground">{row.updatedAt.slice(0, 10)}</p>
            <div className="flex gap-3 text-sm md:justify-end md:opacity-45 md:transition md:group-hover:opacity-100">
              <a href={row.viewHref} target="_blank" rel="noreferrer" className="font-bold underline">查看</a>
              <Link href={row.editHref} className="font-bold underline">编辑</Link>
              <button type="button" onClick={() => setDeleteTarget(row)} className="font-bold text-red-600 underline">删除</button>
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
