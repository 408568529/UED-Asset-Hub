"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export function DropdownMenuContent({ className, sideOffset = 4, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content data-slot="dropdown-menu-content" sideOffset={sideOffset} className={cn("z-50 min-w-48 rounded-[var(--radius-container)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-raised))] p-1 text-foreground shadow-[var(--shadow-raised)]", className)} {...props} /></DropdownMenuPrimitive.Portal>;
}
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return <DropdownMenuPrimitive.Item className={cn("flex min-h-9 cursor-pointer select-none items-center rounded-[var(--radius-control)] px-3 py-2 text-sm outline-none transition-[background-color,color,opacity] duration-[var(--motion-fast)] ease-[var(--ease-standard)] data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)} {...props} />;
}
