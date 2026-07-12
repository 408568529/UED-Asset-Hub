import * as React from "react";
import { cn } from "@/lib/utils";

export const Radio = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Radio(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      data-ui-control
      type="radio"
      className={cn("h-4 w-4 shrink-0 cursor-pointer appearance-none border border-input bg-white checked:border-foreground checked:bg-foreground checked:shadow-[inset_0_0_0_3px_white] focus-visible:shadow-[0_0_0_1px_hsl(var(--foreground))] disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60", className)}
      {...props}
    />
  );
});
