import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ControlSize } from "@/components/ui/input";

const selectSizes: Record<ControlSize, string> = {
  sm: "h-[var(--control-height-sm)] pl-3 pr-8 text-xs",
  md: "h-[var(--control-height-md)] pl-3 pr-9 text-sm",
  lg: "h-[var(--control-height-lg)] pl-4 pr-10 text-base"
};

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  controlSize?: ControlSize;
};

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, controlSize = "md", children, ...props },
  ref
) {
  return (
    <span className="relative block">
      <select
        ref={ref}
        data-ui-control
        className={cn(
          "w-full appearance-none rounded-[var(--radius)] border border-input bg-white text-foreground outline-none transition-[border-color,box-shadow] hover:border-foreground/40 focus:border-foreground focus:shadow-[0_0_0_1px_hsl(var(--foreground))] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 aria-[invalid=true]:border-destructive aria-[invalid=true]:shadow-[0_0_0_1px_hsl(var(--destructive))]",
          selectSizes[controlSize],
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown aria-hidden="true" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
});
