import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-full border border-foreground/[0.08] bg-white px-4 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground/25 focus:ring-4 focus:ring-primary/10",
        className
      )}
      {...props}
    />
  );
}
