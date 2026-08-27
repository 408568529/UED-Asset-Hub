import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[var(--radius-control)] border border-border bg-[hsl(var(--surface-subtle))] px-2 font-mono text-[11px] tracking-[0.04em] text-muted-foreground transition-[background-color,border-color,color,opacity,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)]",
        className
      )}
      {...props}
    />
  );
}
