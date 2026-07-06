"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const actions = [
  { href: "/admin/products/new", label: "Vibe Product", description: "新增团队自研工具" },
  { href: "/admin/skills/new", label: "Skill Center", description: "上传团队 Skill ZIP 包" },
  { href: "/admin/components/new", label: "组件规范", description: "新增组件规范资产" },
  { href: "/admin/sops/new", label: "标准 SOP", description: "新增流程与协作规范" }
];

export function CreateAssetMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 items-center justify-center gap-2 bg-foreground px-5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-foreground/90"
      >
        新建资产
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 top-14 z-20 w-72 border border-foreground/10 bg-[#fffefa] p-2 shadow-2xl">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              onClick={() => setOpen(false)}
              className="block border-b border-foreground/10 px-4 py-3 last:border-b-0 hover:bg-foreground hover:text-white"
            >
              <span className="block text-sm font-black">{action.label}</span>
              <span className="mt-1 block text-xs opacity-70">{action.description}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
