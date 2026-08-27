"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const PrimitiveDialog = DialogPrimitive.Root;
export const PrimitiveDialogTrigger = DialogPrimitive.Trigger;
export const PrimitiveDialogClose = DialogPrimitive.Close;
export function PrimitiveDialogContent({ children, className, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay data-slot="dialog-overlay" className="fixed inset-0 z-50 bg-foreground/36 backdrop-blur-[2px]" />
      <DialogPrimitive.Content data-slot="dialog-content" className={cn("fixed left-1/2 top-1/2 z-50 w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-container)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-7 text-foreground shadow-[0_32px_90px_-36px_rgba(0,0,0,0.62)] outline-none", className)} {...props}>
        {children}
        <DialogPrimitive.Close aria-label="关闭" className="absolute right-3 top-3 rounded-[var(--radius-control)] p-1 text-muted-foreground outline-none hover:bg-muted focus-visible:shadow-[0_0_0_1px_hsl(var(--foreground))]"><X size={16} /></DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export const PrimitiveDialogTitle = DialogPrimitive.Title;
export const PrimitiveDialogDescription = DialogPrimitive.Description;
