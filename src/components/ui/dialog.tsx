import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/45 px-5 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={label} className={cn("w-full max-w-md border border-border bg-background p-7 shadow-[0_24px_80px_rgba(0,0,0,0.2)]", className)}>
        {children}
      </div>
    </div>
  );
}

export const AlertDialog = Dialog;
