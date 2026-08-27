import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-transparent font-bold leading-none transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[0_0_0_2px_hsl(var(--foreground)/0.14)] active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-foreground text-white shadow-[0_10px_24px_-18px_rgba(0,0,0,0.65)] hover:bg-foreground/90",
        secondary: "border-primary bg-primary text-foreground hover:border-foreground hover:bg-primary/85",
        outline: "border-border bg-[hsl(var(--surface))] text-foreground hover:border-foreground hover:bg-foreground hover:text-white",
        ghost: "text-foreground hover:bg-[hsl(var(--surface-subtle))]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      },
      size: {
        sm: "h-[var(--control-height-sm)] px-3 text-xs",
        md: "h-[var(--control-height-md)] px-4 text-sm",
        lg: "h-[var(--control-height-lg)] px-5 text-base",
        icon: "h-[var(--control-height-md)] w-[var(--control-height-md)] p-0"
      }
    },
    defaultVariants: { variant: "primary", size: "md" }
  }
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & {
  asChild?: boolean;
};

export function Button({ className, variant = "primary", size = "md", asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-ui-control
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
