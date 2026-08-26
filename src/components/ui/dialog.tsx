import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Dialog({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/36 px-5 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-label={label} className={cn("w-full max-w-md border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] p-7 shadow-[0_32px_90px_-36px_rgba(0,0,0,0.62)]", className)}>
        {children}
      </div>
    </div>
  );
}

export const AlertDialog = Dialog;
