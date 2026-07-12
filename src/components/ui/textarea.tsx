import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      data-ui-control
      className={cn(
        "min-h-[120px] w-full resize-y rounded-[var(--radius)] border border-input bg-white px-3 py-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-foreground/40 focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 aria-[invalid=true]:border-destructive aria-[invalid=true]:shadow-[0_0_0_1px_hsl(var(--destructive))]",
        className
      )}
      {...props}
    />
  );
});
