"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { openModules } from "@/config/modules";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ModuleNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:py-0" aria-label="资产模块导航">
      {Object.entries(openModules).map(([id, module]) => {
        const active = isActive(pathname, module.href);

        return (
          <Link
            key={id}
            href={module.href}
            aria-current={active ? "page" : undefined}
            className={`relative shrink-0 px-3 py-2 text-sm font-bold transition-colors after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-left after:bg-primary after:transition-transform ${
              active
                ? "text-foreground after:scale-x-100"
                : "text-muted-foreground after:scale-x-0 hover:text-foreground hover:after:scale-x-100"
            }`}
          >
            {module.name}
          </Link>
        );
      })}
    </nav>
  );
}
