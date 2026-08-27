"use client";

import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { isAdminLoggedIn } from "@/lib/adminSession";
import { appendKnowledgeReturnHref } from "@/lib/knowledgeNavigation";

const actions = [
  { href: "/admin/knowledge/new?type=knowledge", label: "知识文章", description: "新建 Markdown 知识文章" },
  { href: "/admin/knowledge/new?type=project", label: "项目沉淀", description: "新建 Markdown 项目沉淀" },
  { href: "/admin/knowledge/new?type=micro-spec", label: "微规范", description: "在线创建或上传 Markdown" },
  { href: "/admin/sops/new", label: "SOP", description: "新增团队流程规范" },
  { href: "/admin/components/new", label: "组件规范", description: "新增组件文档与链接" },
  { href: "/admin/prompts/new", label: "Prompt", description: "新增可复用提示词" },
  { href: "/admin/skills/new", label: "Skill", description: "上传团队 Skill ZIP 包" },
  { href: "/admin/training/create", label: "培训资料", description: "上传或关联培训视频" },
  { href: "/admin/products/new", label: "Vibe Product", description: "新增团队产品与工具" },
  { href: "/admin/fonts/new", label: "Font", description: "上传字体资源和版本" }
];

export function KnowledgeCreateMenu({ returnTo = "/knowledge" }: { returnTo?: string }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function sync() {
      setLoggedIn(await isAdminLoggedIn());
    }

    void sync();
    window.addEventListener("storage", sync);
    window.addEventListener("ued-admin-session-change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("ued-admin-session-change", sync);
    };
  }, []);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  if (!loggedIn) return null;

  return (
    <div ref={rootRef} className="relative">
      <Button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">
        <Plus size={16} />
        新建
        <ChevronDown size={15} />
      </Button>
      {open ? (
        <div role="menu" className="absolute right-0 top-12 z-30 w-72 border border-border bg-[hsl(var(--surface-raised))] p-2 shadow-[var(--shadow-raised)]">
          {actions.map((action) => (
            <Link key={action.href} href={appendKnowledgeReturnHref(action.href, returnTo)} role="menuitem" onClick={() => setOpen(false)} className="block border-b border-border px-4 py-3 last:border-b-0 transition-colors hover:bg-[hsl(var(--surface-subtle))] focus-visible:bg-[hsl(var(--surface-subtle))]">
              <span className="block text-sm font-black">{action.label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{action.description}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
