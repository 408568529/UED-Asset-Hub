import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-[var(--radius)] bg-muted px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
