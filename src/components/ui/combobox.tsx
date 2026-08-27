"use client";

import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ComboboxOption = { value: string; label: string; meta?: string | number };

export function Combobox({
  options, value, onValueChange, onCreate,
  normalize = (item) => item.trim().toLocaleLowerCase(),
  placeholder = "搜索或选择", required = false
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          required={required}
          value={query}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
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
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[min(30rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false}>
          <CommandList>
            {filtered.map((option) => {
              const selected = normalize(value) === normalize(option.value);
              return <CommandItem key={option.value} value={option.label} onSelect={() => choose(option)} className="justify-between gap-3">
                <span className="truncate">{option.label}</span>
                {selected ? <Check size={14} aria-hidden="true" /> : option.meta !== undefined ? <span className="font-mono text-xs text-muted-foreground">{option.meta}</span> : null}
              </CommandItem>;
            })}
            {query.trim() && !exact && onCreate ? <CommandItem value={`新建 ${query}`} onSelect={() => void create()} className="gap-2 border-t border-border font-bold"><Plus size={14} />新建“{query.trim()}”</CommandItem> : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
