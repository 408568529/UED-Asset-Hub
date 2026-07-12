"use client";

import { useId, useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

export type ComboboxOption = {
  value: string;
  label: string;
  meta?: string | number;
};

export function Combobox({
  options,
  value,
  onValueChange,
  onCreate,
  normalize = (item) => item.trim().toLocaleLowerCase(),
  placeholder = "搜索或选择",
  required = false
}: {
  options: ComboboxOption[];
  value: string;
  onValueChange: (value: string) => void;
  onCreate?: (value: string) => Promise<string> | string;
  normalize?: (value: string) => string;
  placeholder?: string;
  required?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const listboxId = useId();
  const filtered = useMemo(() => options.filter((option) => !query.trim() || normalize(option.label).includes(normalize(query))), [normalize, options, query]);
  const exact = options.some((option) => normalize(option.label) === normalize(query));

  function choose(option: ComboboxOption) {
    setQuery(option.label);
    onValueChange(option.value);
    setOpen(false);
  }

  async function create() {
    const nextName = query.trim().replace(/\s+/g, " ");
    if (!nextName || !onCreate) return;
    const created = await onCreate(nextName);
    if (!created) return;
    setQuery(created);
    onValueChange(created);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        required={required}
        value={query}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => { setQuery(event.target.value); onValueChange(event.target.value); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (filtered[0]) choose(filtered[0]);
            else void create();
          }
        }}
        placeholder={placeholder}
      />
      {open && (filtered.length || (query.trim() && !exact && onCreate)) ? (
        <div id={listboxId} role="listbox" className="absolute inset-x-0 top-[calc(100%+1px)] z-30 max-h-56 overflow-y-auto border border-input bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.1)]">
          {filtered.map((option) => (
            <button key={option.value} type="button" role="option" aria-selected={normalize(value) === normalize(option.value)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)} className="flex min-h-9 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
              <span>{option.label}</span>{normalize(value) === normalize(option.value) ? <Check size={14} /> : option.meta !== undefined ? <span className="font-mono text-xs text-muted-foreground">{option.meta}</span> : null}
            </button>
          ))}
          {query.trim() && !exact && onCreate ? (
            <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void create()} className="flex min-h-9 w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm font-bold hover:bg-muted">
              <Plus size={14} />新建“{query.trim()}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
