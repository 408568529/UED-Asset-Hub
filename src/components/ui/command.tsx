"use client";

import { Command as CommandPrimitive } from "cmdk";
import { cn } from "@/lib/utils";

export const Command = CommandPrimitive;
export function CommandInput({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return <CommandPrimitive.Input data-ui-control className={cn("h-[var(--control-height-md)] w-full border-b border-border bg-transparent px-3 text-sm outline-none transition-[border-color,color,opacity] duration-[var(--motion-fast)] ease-[var(--ease-standard)] placeholder:text-muted-foreground/65", className)} {...props} />;
}
export function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn("max-h-56 overflow-y-auto p-1", className)} {...props} />;
}
export function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return <CommandPrimitive.Item className={cn("flex min-h-9 cursor-pointer items-center rounded-[var(--radius-control)] px-3 py-2 text-sm transition-[background-color,color,opacity] duration-[var(--motion-fast)] ease-[var(--ease-standard)] data-[selected=true]:bg-muted", className)} {...props} />;
}
