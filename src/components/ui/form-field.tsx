import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
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
    <Label className={cn("grid gap-[var(--field-label-gap)]", className)}>
      <span>
        {label}{required ? <span className="ml-1 text-destructive">*</span> : null}
      </span>
      {children}
      {error ? <span className="text-[13px] leading-5 text-destructive">{error}</span> : hint ? <span className="text-[13px] leading-5 text-muted-foreground">{hint}</span> : null}
    </Label>
  );
}
