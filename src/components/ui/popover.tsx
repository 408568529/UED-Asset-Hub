"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, sideOffset = 4, ...props }: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return <PopoverPrimitive.Portal><PopoverPrimitive.Content data-slot="popover-content" sideOffset={sideOffset} className={cn("z-50 rounded-[var(--radius-container)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-raised))] p-3 text-foreground shadow-[var(--shadow-raised)]", className)} {...props} /></PopoverPrimitive.Portal>;
}
