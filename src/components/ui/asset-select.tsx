"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type AssetSelectOption = { value: string; label: string; disabled?: boolean };

export function AssetSelect({ value, onValueChange, options, placeholder, disabled, required, ariaLabel }: {
  value: string;
  onValueChange: (value: string) => void;
  options: AssetSelectOption[];
  placeholder: string;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled} required={required}>
      <SelectPrimitive.Trigger data-ui-control data-slot="select-trigger" aria-label={ariaLabel} className="flex h-[var(--control-height-md)] w-full items-center justify-between rounded-[var(--radius-control)] border border-input bg-[hsl(var(--surface-raised))] px-3 text-left text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition-[border-color,box-shadow,background-color,color,opacity] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[hsl(var(--border-strong))] focus:border-foreground focus:shadow-[0_0_0_2px_hsl(var(--foreground)/0.14)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 data-[placeholder]:text-muted-foreground/65">
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild><ChevronDown size={15} className="shrink-0 text-muted-foreground" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content data-slot="select-content" position="popper" sideOffset={4} className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-[var(--radius-container)] border border-[hsl(var(--border-strong))] bg-[hsl(var(--surface-raised))] p-1 text-foreground shadow-[var(--shadow-raised)]">
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item key={option.value} value={option.value} disabled={option.disabled} className="relative flex min-h-9 cursor-pointer select-none items-center rounded-[var(--radius-control)] py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-muted data-[state=checked]:bg-[hsl(var(--surface-subtle))] data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
                <span className="absolute left-2 flex h-4 w-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check size={14} /></SelectPrimitive.ItemIndicator></span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
