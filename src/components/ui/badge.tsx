import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-black/10 bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
