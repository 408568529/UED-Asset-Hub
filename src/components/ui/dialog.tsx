"use client";

import { useState, type ReactNode } from "react";
import { PrimitiveDialog, PrimitiveDialogContent, PrimitiveDialogDescription, PrimitiveDialogTitle } from "@/components/ui/dialog-primitive";

export function Dialog({ children, className, label, onClose }: { children: ReactNode; className?: string; label: string; onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <PrimitiveDialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && onClose) {
        setOpen(false);
        onClose();
      }
    }}>
      <PrimitiveDialogContent aria-describedby={undefined} className={className}>
        <PrimitiveDialogTitle className="sr-only">{label}</PrimitiveDialogTitle>
        <PrimitiveDialogDescription className="sr-only">{label}</PrimitiveDialogDescription>
        {children}
      </PrimitiveDialogContent>
    </PrimitiveDialog>
  );
}

export const AlertDialog = Dialog;
