"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { knowledgeModuleHrefs, openModules } from "@/config/modules";

export function Footer() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  if (pathname === "/knowledge" || pathname.startsWith("/knowledge/") || pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/test-environments") return null;
  const mutedText = isHome ? "text-white/48" : "text-muted-foreground";
  const hoverText = isHome ? "hover:text-[#eef1e8]" : "hover:text-foreground";

  return (
    <footer className={`mt-auto border-t ${isHome ? "border-white/15 bg-[#080b0a] text-[#eef1e8]" : "border-border bg-[hsl(var(--surface-subtle)/0.62)]"}`}>
      <div className="page-shell py-9 md:py-11">
        <div className="grid gap-8 lg:grid-cols-[17rem_1fr] lg:items-start">
          <div className="border-l-2 border-primary pl-4">
            <p className={`font-mono text-[11px] uppercase tracking-[0.2em] ${mutedText}`}>UED Asset Studio</p>
            <p className="mt-2 text-lg font-black">Ideas become assets.</p>
            <p className={`mt-2 text-sm leading-6 ${mutedText}`}>让团队经验持续被发现与复用。</p>
          </div>
          <nav className={`grid grid-cols-2 gap-x-8 gap-y-3 text-sm ${mutedText} sm:grid-cols-4 lg:justify-self-end`} aria-label="页脚导航">
            {Object.entries(openModules).map(([id, module]) => (
              <Link key={module.href} href={knowledgeModuleHrefs[id as keyof typeof knowledgeModuleHrefs]} className={`transition ${hoverText}`}>{module.name}</Link>
            ))}
          </nav>
        </div>
        <div className={`mt-8 flex flex-col gap-4 border-t pt-5 font-mono text-[10px] uppercase tracking-[0.16em] sm:flex-row sm:items-center sm:justify-between ${isHome ? "border-white/15 text-white/42" : "border-border text-muted-foreground"}`}>
          <span>UED Asset Hub / Local-first library</span>
          <div className="flex gap-5">
            <Link href="/search" className={hoverText}>Search</Link>
            <Link href="/admin" className={hoverText}>Admin</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
