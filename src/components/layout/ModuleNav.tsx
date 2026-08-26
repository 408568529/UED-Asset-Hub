"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { primaryNavigation } from "@/config/modules";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ModuleNav({ tone = "light" }: { tone?: "light" | "dark" }) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:py-0" aria-label="主导航">
      {primaryNavigation.map((module) => {
        const active = isActive(pathname, module.href);

        return (
          <Link
            key={module.href}
            href={module.href}
            aria-current={active ? "page" : undefined}
            className={`relative shrink-0 border border-transparent px-3 py-2 text-[13px] font-bold transition-[color,background-color,border-color] after:absolute after:bottom-[-1px] after:left-3 after:h-0.5 after:w-5 after:origin-left after:bg-primary after:transition-transform ${
              active
                ? tone === "dark"
                  ? "border-white/15 bg-white/[0.08] text-[#eef1e8] after:scale-x-100"
                  : "border-border bg-[hsl(var(--surface))] text-foreground after:scale-x-100"
                : tone === "dark"
                  ? "text-white/55 after:scale-x-0 hover:bg-white/[0.06] hover:text-[#eef1e8] hover:after:scale-x-100"
                  : "text-muted-foreground after:scale-x-0 hover:bg-[hsl(var(--surface)/0.7)] hover:text-foreground hover:after:scale-x-100"
            }`}
          >
            {module.name}
          </Link>
        );
      })}
    </nav>
  );
}
