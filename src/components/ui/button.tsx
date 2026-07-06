import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({ className, variant = "primary", size = "md", asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-bold leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-foreground text-white hover:-translate-y-0.5 hover:bg-foreground/90",
        variant === "secondary" && "bg-primary text-foreground hover:-translate-y-0.5 hover:bg-primary/90",
        variant === "outline" && "border border-foreground/15 bg-transparent text-foreground hover:border-foreground hover:bg-foreground hover:text-white",
        variant === "ghost" && "text-foreground hover:bg-foreground hover:text-white",
        size === "sm" && "h-10 min-w-24 px-4 text-sm",
        size === "md" && "h-11 min-w-28 px-5 text-sm",
        size === "lg" && "h-12 min-w-32 px-6 text-base",
        size === "icon" && "h-11 w-11 min-w-0",
        className
      )}
      {...props}
    />
  );
}
