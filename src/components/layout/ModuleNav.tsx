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
    <nav className="hidden items-center gap-1 lg:flex">
      {Object.entries(openModules).map(([id, module]) => {
        const active = isActive(pathname, module.href);

        return (
          <Link
            key={id}
            href={module.href}
            aria-current={active ? "page" : undefined}
            className={`relative px-3 py-2 text-sm font-bold transition ${
              active
                ? "bg-foreground text-white"
                : "text-muted-foreground hover:bg-foreground hover:text-white"
            }`}
          >
            {module.name}
          </Link>
        );
      })}
    </nav>
  );
}
