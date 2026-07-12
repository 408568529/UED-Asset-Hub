import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FormField({
  label,
  required = false,
  hint,
  error,
  children,
  className
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-2", className)}>
      <span className="text-sm font-bold leading-5">
        {label}{required ? <span className="ml-1 text-destructive">*</span> : null}
      </span>
      {children}
      {error ? <span className="text-xs leading-5 text-destructive">{error}</span> : hint ? <span className="text-xs leading-5 text-muted-foreground">{hint}</span> : null}
    </label>
  );
}
