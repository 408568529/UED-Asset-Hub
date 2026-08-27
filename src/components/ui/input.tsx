import * as React from "react";
import { cn } from "@/lib/utils";

export type ControlSize = "sm" | "md" | "lg";

const inputSizes: Record<ControlSize, string> = {
  sm: "h-[var(--control-height-sm)] px-3 text-xs",
  md: "h-[var(--control-height-md)] px-3 text-sm",
  lg: "h-[var(--control-height-lg)] px-4 text-base"
};

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  controlSize?: ControlSize;
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, controlSize = "md", ...props },
  ref
) {
  return (
    <input
      ref={ref}
      data-ui-control
      data-slot="input"
      className={cn(
        "w-full rounded-[var(--radius-control)] border border-input bg-[hsl(var(--surface-raised))] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition-[border-color,box-shadow,background-color,color,opacity] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65 hover:border-[hsl(var(--border-strong))] focus:border-foreground focus:shadow-[0_0_0_2px_hsl(var(--foreground)/0.14)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 aria-[invalid=true]:border-destructive aria-[invalid=true]:shadow-[0_0_0_2px_hsl(var(--destructive)/0.14)] file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-bold",
        inputSizes[controlSize],
        className
      )}
      {...props}
    />
  );
});
