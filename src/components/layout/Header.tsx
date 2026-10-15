"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminNavActions } from "@/components/layout/AdminNavActions";
import { ModuleNav } from "@/components/layout/ModuleNav";

export function Header() {
  const pathname = usePathname();
  const home = pathname === "/";
  const agent = pathname === "/agent" || pathname.startsWith("/agent/");
  const dark = home || agent;

  return (
    <header data-hub-visual={home ? "v1.1" : undefined} className={`hub-document-header ${home ? "home-header" : ""} sticky top-0 z-40 shrink-0 border-b backdrop-blur-xl ${dark ? "agent-header border-white/10 bg-[#080b0a]/90 text-[#eef1e8]" : "border-border bg-[hsl(var(--background)/0.94)]"}`}>
      <div className="hub-header-inner page-shell grid min-h-[4.5rem] grid-cols-[auto_1fr_auto] items-center gap-5 lg:gap-8">
        <Link href="/" className="hub-header-brand group flex items-center gap-3" aria-label="返回 UED Asset Hub 首页">
          <span className={`hub-header-mark relative flex h-10 w-10 items-center justify-center border text-sm font-bold ${dark ? "border-white/65 bg-[#eef1e8] text-[#080b0a]" : "border-foreground bg-foreground text-white"}`}>
            U
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-primary transition group-hover:h-3.5 group-hover:w-3.5" />
          </span>
          <span>
            <span className="hub-header-name block text-[15px] font-black leading-4 tracking-normal">UED Asset Hub</span>
            <span className={`hub-header-subtitle mt-1 block font-mono text-[10px] uppercase tracking-[0.2em] ${dark ? "text-white/48" : "text-muted-foreground"}`}>Asset Studio / Internal</span>
          </span>
        </Link>

        <div className="hub-header-primary hidden min-w-0 justify-self-center lg:block">
          <ModuleNav tone={dark ? "dark" : "light"} />
        </div>

        <div className="hub-header-actions col-start-3 justify-self-end"><AdminNavActions tone={dark ? "dark" : "light"} /></div>
      </div>
      <div className={`border-t lg:hidden ${dark ? "border-white/10" : "border-foreground/[0.06]"}`}>
        <div className="page-shell">
          <ModuleNav tone={dark ? "dark" : "light"} />
        </div>
      </div>
    </header>
  );
}
