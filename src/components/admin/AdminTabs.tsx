import Link from "next/link";

const tabs = [
  { href: "/admin", label: "内容管理" },
  { href: "/admin/logs", label: "更新日志" },
  { href: "/admin/uploads", label: "上传记录" },
  { href: "/admin/versions", label: "版本记录" },
  { href: "/admin/settings", label: "系统设置" }
];

export function AdminTabs() {
  return (
    <nav className="mt-10 flex flex-wrap gap-2 border-t border-foreground/10 pt-5">
      {tabs.map((tab) => (
        <Link key={tab.href} href={tab.href} className="rounded-full border border-foreground/10 px-4 py-2 text-sm transition hover:border-foreground hover:bg-foreground hover:text-white">
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
