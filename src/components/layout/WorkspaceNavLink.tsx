import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function WorkspaceNavLink({ active, className, ...props }: ComponentProps<typeof Link> & { active: boolean }) {
  return <Link {...props} aria-current={active ? "page" : undefined} className={cn("workspace-nav-link", active && "workspace-nav-link-active", className)} />;
}
