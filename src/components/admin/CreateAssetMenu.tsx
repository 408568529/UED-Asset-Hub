"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

const actions = [
  { href: "/admin/products/new", label: "Vibe Product", description: "新增团队自研工具" },
  { href: "/admin/skills/new", label: "Skill Center", description: "上传团队 Skill ZIP 包" },
  { href: "/admin/fonts/new", label: "Font Library", description: "上传字体资源和版本" },
  { href: "/admin/prompts/new", label: "Prompt Library", description: "新增可复用 Prompt" },
  { href: "/admin/components/new", label: "组件规范", description: "新增组件规范资产" },
  { href: "/admin/sops/new", label: "标准 SOP", description: "新增流程与协作规范" },
  { href: "/admin/test-environments", label: "测试环境", description: "在表格中新增客户版本测试环境" },
  { href: "/admin/training/create", label: "培训资料", description: "上传或关联培训视频" }
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
      <Button
        type="button"
        onClick={() => setOpen((value) => !value)}
      >
        新建资产
        <ChevronDown size={16} />
      </Button>
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
