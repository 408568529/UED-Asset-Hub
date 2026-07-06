import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-36 w-full rounded-2xl border border-foreground/[0.08] bg-white px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-foreground/25 focus:ring-4 focus:ring-primary/10",
        className
      )}
      {...props}
    />
  );
}
