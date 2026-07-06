import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-foreground/[0.045] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
