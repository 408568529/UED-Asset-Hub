"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MultiSelectOption = { value: string; label: string; meta?: string | number };

export function MultiSelect({
  options, value, onValueChange, onCreate,
  normalize = (item) => item.trim().toLocaleLowerCase(),
  placeholder = "搜索或创建选项", className
}: {
  options: MultiSelectOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  onCreate?: (value: string) => Promise<string> | string;
  normalize?: (value: string) => string;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selectedKeys = useMemo(() => new Set(value.map(normalize)), [normalize, value]);
  const normalizedQuery = normalize(query);
  const filtered = useMemo(() => options.filter((option) => !normalizedQuery || normalize(option.label).includes(normalizedQuery)), [normalize, normalizedQuery, options]);
  const canCreate = Boolean(query.trim() && !options.some((option) => normalize(option.label) === normalizedQuery) && onCreate);

  async function add(nextValue: string) {
    const trimmed = nextValue.trim().replace(/\s+/g, " ");
    if (!trimmed || selectedKeys.has(normalize(trimmed))) return;
    const existing = options.find((option) => normalize(option.value) === normalize(trimmed) || normalize(option.label) === normalize(trimmed));
    const resolved = existing?.value ?? (onCreate ? await onCreate(trimmed) : trimmed);
    if (!resolved) return;
    onValueChange([...value, resolved]);
    setQuery("");
  }

  function toggle(option: MultiSelectOption) {
    const key = normalize(option.value);
    onValueChange(selectedKeys.has(key) ? value.filter((selected) => normalize(selected) !== key) : [...value, option.value]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" data-ui-control data-slot="multi-select-trigger" aria-label={placeholder} className={cn("flex min-h-[var(--control-height-md)] w-full flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-input bg-[hsl(var(--surface-raised))] px-2 py-1 text-left text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition-[border-color,box-shadow,background-color,color,opacity] duration-[var(--motion-fast)] ease-[var(--ease-standard)] hover:border-[hsl(var(--border-strong))] focus-visible:border-foreground focus-visible:shadow-[0_0_0_2px_hsl(var(--foreground)/0.14)] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70", className)}>
          {value.length ? value.map((item) => (
            <span key={normalize(item)} className="inline-flex h-6 max-w-full items-center gap-1 rounded-[var(--radius-control)] border border-border bg-muted px-1.5 text-xs font-bold">
              <span className="truncate">{options.find((option) => normalize(option.value) === normalize(item))?.label ?? item}</span>
              <X size={12} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </span>
          )) : <span className="px-1 text-muted-foreground/65">{placeholder}</span>}
          <ChevronDown size={15} className="ml-auto shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[min(30rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="筛选选项" />
          <CommandList>
            {filtered.map((option) => {
              const selected = selectedKeys.has(normalize(option.value));
              return <CommandItem key={option.value} value={option.label} onSelect={() => toggle(option)} className="justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2"><Checkbox checked={selected} tabIndex={-1} aria-hidden="true" className="pointer-events-none" /><span className="truncate">{option.label}</span></span>
                {option.meta !== undefined ? <span className="font-mono text-xs text-muted-foreground">{option.meta}</span> : selected ? <Check size={14} aria-hidden="true" /> : null}
              </CommandItem>;
            })}
            {canCreate ? <CommandItem value={`创建 ${query}`} onSelect={() => void add(query)} className="gap-2 border-t border-border font-bold"><Plus size={14} />创建“{query.trim()}”</CommandItem> : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
