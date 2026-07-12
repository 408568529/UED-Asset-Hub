import Link from "next/link";
import { AdminNavActions } from "@/components/layout/AdminNavActions";
import { ModuleNav } from "@/components/layout/ModuleNav";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-[#f8f7f1]/95 backdrop-blur-xl">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-5 px-5 py-4 lg:gap-8">
        <Link href="/" className="group flex items-center gap-3" aria-label="返回 UED Asset Hub 首页">
          <span className="relative flex h-10 w-10 items-center justify-center bg-foreground text-sm font-bold text-white">
            U
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 bg-primary transition group-hover:h-3.5 group-hover:w-3.5" />
          </span>
          <span>
            <span className="block text-sm font-black leading-4 tracking-normal">UED Asset Hub</span>
            <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Asset Studio</span>
          </span>
        </Link>

        <div className="hidden min-w-0 justify-self-center lg:block">
          <ModuleNav />
        </div>

        <AdminNavActions />
      </div>
      <div className="border-t border-foreground/[0.06] lg:hidden">
        <div className="mx-auto max-w-7xl px-5">
          <ModuleNav />
        </div>
      </div>
    </header>
  );
}
