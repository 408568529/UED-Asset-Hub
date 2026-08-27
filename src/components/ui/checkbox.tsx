"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CheckboxProps = Omit<React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>, "onChange" | "onCheckedChange"> & {
  onCheckedChange?: (checked: boolean) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

export const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, CheckboxProps>(function Checkbox(
  { className, onCheckedChange, onChange, ...props },
  ref
) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      data-ui-control
      data-slot="checkbox"
      onCheckedChange={(checked) => {
        const resolved = checked === true;
        onCheckedChange?.(resolved);
        onChange?.({ target: { checked: resolved } } as React.ChangeEvent<HTMLInputElement>);
      }}
      className={cn("flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-input bg-[hsl(var(--surface-raised))] text-white outline-none transition-[background-color,border-color,box-shadow,opacity] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[hsl(var(--border-strong))] focus-visible:shadow-[0_0_0_2px_hsl(var(--foreground)/0.14)] data-[state=checked]:border-foreground data-[state=checked]:bg-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60", className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="asset-checkbox-indicator transition-[opacity,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)]"><Check size={12} strokeWidth={3} /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
