import Link from "next/link";
import { openModules } from "@/config/modules";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-foreground/10 bg-foreground text-white">
      <div className="mx-auto max-w-7xl px-5 py-12 md:py-16">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:items-end">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-white/45">UED Asset Studio</p>
            <p className="mt-6 max-w-2xl text-4xl font-black leading-[0.96] text-white md:text-6xl">Ideas become assets.</p>
            <p className="mt-5 max-w-md text-sm leading-7 text-white/55">让团队资产像内容一样被发现、下载和持续复用。</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm text-white/65 sm:grid-cols-3" aria-label="页脚导航">
            {Object.values(openModules).map((module) => (
              <Link key={module.href} href={module.href} className="transition hover:text-primary">{module.name}</Link>
            ))}
          </nav>
        </div>
        <div className="mt-12 flex flex-col gap-4 border-t border-white/15 pt-5 font-mono text-[11px] uppercase tracking-[0.14em] text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>UED Asset Hub</span>
          <div className="flex gap-5">
            <Link href="/search" className="hover:text-white">Search</Link>
            <Link href="/admin" className="hover:text-white">Admin</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
