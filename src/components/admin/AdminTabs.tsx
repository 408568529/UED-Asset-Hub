"use client";

import { WorkspaceNavLink } from "@/components/layout/WorkspaceNavLink";
import { usePathname, useRouter } from "next/navigation";
import { Activity, Boxes, History, Settings, Upload, Wrench } from "lucide-react";
import { Select } from "@/components/ui/select";

const groups = [
  { label: "内容管理", items: [{ href: "/admin", label: "全部资产", icon: Boxes }] },
  { label: "业务管理", items: [{ href: "/admin/test-environments", label: "测试环境管理", icon: Wrench }] },
  { label: "系统", items: [
    { href: "/admin/uploads", label: "上传记录", icon: Upload },
    { href: "/admin/logs", label: "更新日志", icon: History },
    { href: "/admin/versions", label: "版本记录", icon: History },
    { href: "/admin/settings", label: "系统设置", icon: Settings },
    { href: "/admin/runtime-diagnostics", label: "运行诊断", icon: Activity }
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
    <nav aria-label="管理模块导航" className="admin-sidebar-nav">
      <div className="lg:hidden">
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">当前模块</p>
        <Select value={current.href} onChange={(event) => router.push(event.target.value)}>
          {tabs.map((tab) => <option key={tab.href} value={tab.href}>{tab.label}</option>)}
        </Select>
      </div>
      <div className="hidden lg:block">
        <p className="admin-nav-title">管理工作区</p>
        <div className="admin-nav-groups">
          {groups.map((group) => <div key={group.label}>
            <p className="admin-nav-group-title">{group.label}</p>
            <div className="grid gap-0.5">{group.items.map((tab) => {
              const Icon = tab.icon;
              const active = tab.href === "/admin" ? pathname === "/admin" : current.href === tab.href;
              return <WorkspaceNavLink key={tab.href} href={tab.href} active={active}><Icon size={16} strokeWidth={1.7} aria-hidden="true" /><span>{tab.label}</span></WorkspaceNavLink>;
            })}</div>
          </div>)}
        </div>
      </div>
    </nav>
  );
}
