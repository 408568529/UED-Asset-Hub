import * as React from "react";
import { cn } from "@/lib/utils";

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="tablist" className={cn("flex min-w-max items-end gap-6 border-b border-border", className)} {...props} />;
}

export function TabsTrigger({ active = false, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-ui-control
      className={cn("relative -mb-px inline-flex h-[var(--control-height-md)] shrink-0 items-center gap-1 border-b-2 border-transparent px-0 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground focus-visible:shadow-[0_1px_0_hsl(var(--foreground))]", active && "border-foreground text-foreground", className)}
      {...props}
    />
  );
}
