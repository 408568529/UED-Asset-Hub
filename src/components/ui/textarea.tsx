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
      data-slot="textarea"
      className={cn(
        "min-h-[var(--textarea-min-height)] w-full resize-y rounded-[var(--radius-control)] border border-input bg-[hsl(var(--surface-raised))] px-3 py-2.5 text-sm leading-5 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition-[border-color,box-shadow,background-color,color,opacity] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-[hsl(var(--border-strong))] focus:border-foreground focus:shadow-[0_0_0_2px_hsl(var(--foreground)/0.14)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 aria-[invalid=true]:border-destructive aria-[invalid=true]:shadow-[0_0_0_2px_hsl(var(--destructive)/0.14)]",
        className
      )}
      {...props}
    />
  );
});
