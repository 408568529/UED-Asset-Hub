"use client";

import { useId, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  value: string;
  label: string;
  meta?: string | number;
};

export function MultiSelect({
  options,
  value,
  onValueChange,
  onCreate,
  normalize = (item) => item.trim().toLocaleLowerCase(),
  placeholder = "搜索或创建选项",
  className
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
  const listboxId = useId();
  const selectedKeys = useMemo(() => new Set(value.map(normalize)), [normalize, value]);
  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query);
    return options.filter((option) => !selectedKeys.has(normalize(option.value)) && (!normalizedQuery || normalize(option.label).includes(normalizedQuery)));
  }, [normalize, options, query, selectedKeys]);

  async function add(nextValue: string) {
    const trimmed = nextValue.trim().replace(/\s+/g, " ");
    if (!trimmed || selectedKeys.has(normalize(trimmed))) return;
    const existing = options.find((option) => normalize(option.value) === normalize(trimmed) || normalize(option.label) === normalize(trimmed));
    const resolved = existing?.value ?? (onCreate ? await onCreate(trimmed) : trimmed);
    if (!resolved) return;
    onValueChange([...value, resolved]);
    setQuery("");
    setOpen(true);
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex min-h-[var(--control-height-md)] flex-wrap items-center gap-1.5 border border-input bg-white px-2 py-1.5 transition-[border-color,box-shadow] hover:border-foreground/40 focus-within:border-foreground focus-within:shadow-[0_0_0_1px_hsl(var(--foreground))]">
        {value.map((item) => (
          <span key={normalize(item)} className="inline-flex h-6 items-center gap-1.5 bg-muted px-2 text-xs font-bold">
            {item}
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onValueChange(value.filter((selected) => normalize(selected) !== normalize(item)))} aria-label={`删除 ${item}`}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          data-ui-control
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void add(filtered[0]?.value ?? query);
            }
            if (event.key === "Backspace" && !query && value.length) onValueChange(value.slice(0, -1));
          }}
          placeholder={value.length ? "继续添加" : placeholder}
          className="h-6 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/70"
        />
        <Button type="button" size="sm" variant="ghost" onMouseDown={(event) => event.preventDefault()} onClick={() => void add(filtered[0]?.value ?? query)} disabled={!query.trim() && !filtered.length} className="h-7 px-2">
          <Plus size={13} />添加
        </Button>
      </div>
      {open && (filtered.length || query.trim()) ? (
        <div id={listboxId} role="listbox" className="absolute inset-x-0 top-[calc(100%+1px)] z-30 max-h-52 overflow-y-auto border border-input bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.1)]">
          {filtered.slice(0, 12).map((option) => (
            <button key={option.value} type="button" role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => void add(option.value)} className="flex min-h-9 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
              <span>{option.label}</span>{option.meta !== undefined ? <span className="font-mono text-xs text-muted-foreground">{option.meta}</span> : null}
            </button>
          ))}
          {query.trim() && !options.some((option) => normalize(option.label) === normalize(query)) ? (
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void add(query)} className="flex min-h-9 w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-bold hover:bg-muted">
              <Plus size={14} />创建“{query.trim()}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
