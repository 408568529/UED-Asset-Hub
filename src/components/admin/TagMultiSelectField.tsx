"use client";

import { useCallback, useEffect, useState } from "react";
import { MultiSelect } from "@/components/ui/multi-select";
import Link from "next/link";
import { normalizeTagName } from "@/lib/tagUtils";
import type { TagType } from "@/types/tag";
import type { TaxonomyItem } from "@/types/taxonomy";

function unique(values: string[]) {
  const result = new Map<string, string>();
  values.forEach((value) => {
    const name = value.trim().replace(/\s+/g, " ");
    const key = normalizeTagName(name);
    if (key && !result.has(key)) result.set(key, name);
  });
  return [...result.values()];
}

export function TagMultiSelectField({
  type,
  name,
  defaultValue = [],
  value,
  onChange,
  placeholder = "搜索历史选项，或输入新选项后回车"
}: {
  type: TagType;
  name?: string;
  defaultValue?: string[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
}) {
  const [internalValue, setInternalValue] = useState(() => unique(defaultValue));
  const [available, setAvailable] = useState<TaxonomyItem[]>([]);
  const selected = value ?? internalValue;

  const loadAvailable = useCallback(() => {
    fetch(`/api/taxonomy?type=${encodeURIComponent(type)}`)
      .then((response) => response.ok ? response.json() : [])
      .then((tags: TaxonomyItem[]) => setAvailable(tags))
      .catch(() => setAvailable([]));
  }, [type]);

  useEffect(() => {
    loadAvailable();
    window.addEventListener("focus", loadAvailable);
    return () => window.removeEventListener("focus", loadAvailable);
  }, [loadAvailable]);

  function commit(next: string[]) {
    const normalized = unique(next);
    if (value === undefined) setInternalValue(normalized);
    onChange?.(normalized);
  }

  async function createTag(tagName: string) {
    const response = await fetch("/api/taxonomy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name: tagName })
    });
    if (!response.ok) return "";
    const created = await response.json() as TaxonomyItem;
    setAvailable((current) => current.some((tag) => tag.id === created.id) ? current : [...current, created]);
    return created.name;
  }

  return (
    <div className="space-y-2">
      {name ? <input type="hidden" name={name} value={selected.join(",")} /> : null}
      <MultiSelect
        options={available.map((tag) => ({ value: tag.name, label: tag.name, meta: tag.usageCount }))}
        value={selected}
        onValueChange={commit}
        onCreate={createTag}
        normalize={normalizeTagName}
        placeholder={placeholder}
      />
      <Link href="/admin/settings/base-data" className="inline-block text-xs font-bold text-muted-foreground underline underline-offset-4 hover:text-foreground">管理历史选项 →</Link>
    </div>
  );
}
