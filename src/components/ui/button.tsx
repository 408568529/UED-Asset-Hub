import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "outline" | "destructive";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({ className, variant = "primary", size = "md", asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-ui-control
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] border border-transparent font-bold leading-none transition-[background-color,border-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[0_0_0_1px_hsl(var(--foreground))] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-foreground text-white hover:bg-foreground/90",
        variant === "secondary" && "bg-primary text-foreground hover:bg-primary/90",
        variant === "outline" && "border border-foreground/15 bg-transparent text-foreground hover:border-foreground hover:bg-foreground hover:text-white",
        variant === "ghost" && "text-foreground hover:bg-foreground hover:text-white",
        variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        size === "sm" && "h-[var(--control-height-sm)] px-3 text-xs",
        size === "md" && "h-[var(--control-height-md)] px-4 text-sm",
        size === "lg" && "h-[var(--control-height-lg)] px-5 text-base",
        size === "icon" && "h-[var(--control-height-md)] w-[var(--control-height-md)] p-0",
        className
      )}
      {...props}
    />
  );
}
