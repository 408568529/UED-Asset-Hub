import * as React from "react";
import { cn } from "@/lib/utils";

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Checkbox(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      data-ui-control
      type="checkbox"
      className={cn("h-4 w-4 shrink-0 cursor-pointer appearance-none border border-input bg-white checked:border-foreground checked:bg-foreground checked:bg-[linear-gradient(135deg,transparent_42%,white_42%,white_52%,transparent_52%),linear-gradient(45deg,transparent_57%,white_57%,white_67%,transparent_67%)] focus-visible:shadow-[0_0_0_1px_hsl(var(--foreground))] disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60", className)}
      {...props}
    />
  );
});
