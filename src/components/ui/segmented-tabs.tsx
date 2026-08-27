"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export function SegmentedTabs({ value, onValueChange, children, className, ariaLabel }: {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel: string;
}) {
  return <TabsPrimitive.Root value={value} onValueChange={onValueChange}><TabsPrimitive.List aria-label={ariaLabel} className={cn("grid grid-cols-2 gap-2", className)}>{children}</TabsPrimitive.List></TabsPrimitive.Root>;
}

export function SegmentedTabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return <TabsPrimitive.Trigger value={value} className="flex h-[var(--control-height-md)] items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-[hsl(var(--surface-raised))] px-4 text-sm font-bold text-foreground outline-none transition-[background-color,border-color,color,box-shadow,opacity] duration-[var(--motion-base)] ease-[var(--ease-standard)] hover:border-[hsl(var(--border-strong))] focus-visible:shadow-[0_0_0_2px_hsl(var(--foreground)/0.14)] data-[state=active]:border-foreground data-[state=active]:bg-foreground data-[state=active]:text-white">{children}</TabsPrimitive.Trigger>;
}
