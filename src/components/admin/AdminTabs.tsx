"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, History, Settings, Upload, Wrench } from "lucide-react";
import { Select } from "@/components/ui/select";

const groups = [
  { label: "内容管理", items: [{ href: "/admin", label: "全部资产", icon: Boxes }] },
  { label: "业务管理", items: [{ href: "/admin/test-environments", label: "测试环境管理", icon: Wrench }] },
  { label: "系统", items: [
    { href: "/admin/uploads", label: "上传记录", icon: Upload },
    { href: "/admin/logs", label: "更新日志", icon: History },
    { href: "/admin/versions", label: "版本记录", icon: History },
    { href: "/admin/settings", label: "系统设置", icon: Settings }
  ] }
];
const tabs = groups.flatMap((group) => group.items);

function getCurrentTab(pathname: string) {
  return tabs.find((tab) => tab.href !== "/admin" && pathname.startsWith(tab.href)) ?? tabs[0];
}

export function AdminTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const current = getCurrentTab(pathname);

  return (
    <nav aria-label="管理模块导航">
      <div className="lg:hidden">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">当前模块</p>
        <Select value={current.href} onChange={(event) => router.push(event.target.value)}>
          {tabs.map((tab) => <option key={tab.href} value={tab.href}>{tab.label}</option>)}
        </Select>
      </div>
      <div className="hidden lg:block">
        <p className="mb-4 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">管理工作区</p>
        <div className="grid gap-5">
          {groups.map((group) => <div key={group.label}>
            <p className="mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{group.label}</p>
            <div className="grid gap-0.5">{group.items.map((tab) => {
              const Icon = tab.icon;
              const active = tab.href === "/admin" ? pathname === "/admin" : current.href === tab.href;
              return <Link key={tab.href} href={tab.href} className={`relative flex min-h-9 items-center gap-3 border border-transparent px-3 text-[13px] transition-colors before:absolute before:inset-y-2 before:left-0 before:w-0.5 ${active ? "border-border bg-[hsl(var(--surface))] font-bold text-foreground before:bg-primary" : "text-muted-foreground hover:bg-[hsl(var(--surface)/0.7)] hover:text-foreground"}`}><Icon size={15} strokeWidth={1.7} /><span>{tab.label}</span></Link>;
            })}</div>
          </div>)}
        </div>
      </div>
    </nav>
  );
}
