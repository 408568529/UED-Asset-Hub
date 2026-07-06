import Link from "next/link";
import { AdminNavActions } from "@/components/layout/AdminNavActions";
import { ModuleNav } from "@/components/layout/ModuleNav";

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-foreground/10 bg-[#f7f6f0]/82 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-sm font-bold text-white">U</span>
          <span>
            <span className="block text-sm font-black leading-4 tracking-normal">UED Asset Hub</span>
            <span className="block font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Asset Studio</span>
          </span>
        </Link>

        <ModuleNav />

        <AdminNavActions />
      </div>
    </header>
  );
}
