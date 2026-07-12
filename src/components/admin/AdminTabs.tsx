"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, History, Settings, Upload, Video, Wrench } from "lucide-react";
import { Select } from "@/components/ui/select";

const tabs = [
  { href: "/admin", label: "内容管理", icon: FileText },
  { href: "/admin/test-environments", label: "测试环境管理", icon: Wrench },
  { href: "/admin/training", label: "培训资料", icon: Video },
  { href: "/admin/logs", label: "更新日志", icon: History },
  { href: "/admin/uploads", label: "上传记录", icon: Upload },
  { href: "/admin/versions", label: "版本记录", icon: History },
  { href: "/admin/settings", label: "系统设置", icon: Settings }
];

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
      <div className="hidden border-l border-border lg:block">
        <p className="mb-4 pl-4 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">管理工作区</p>
        <div className="grid gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = current.href === tab.href;
            return (
              <Link key={tab.href} href={tab.href} className={`flex min-h-10 items-center gap-3 border-l-2 px-4 text-sm transition-colors ${active ? "-ml-px border-foreground bg-muted font-bold text-foreground" : "-ml-px border-transparent text-muted-foreground hover:border-foreground/35 hover:text-foreground"}`}>
                <Icon size={15} strokeWidth={1.8} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
