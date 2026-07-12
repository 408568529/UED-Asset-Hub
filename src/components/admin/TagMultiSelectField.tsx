"use client";

import { useEffect, useState } from "react";
import { MultiSelect } from "@/components/ui/multi-select";
import { normalizeTagName } from "@/lib/tagUtils";
import type { AssetTagOption, TagType } from "@/types/tag";

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
  const [available, setAvailable] = useState<AssetTagOption[]>([]);
  const selected = value ?? internalValue;

  useEffect(() => {
    fetch(`/api/tags?type=${encodeURIComponent(type)}`)
      .then((response) => response.ok ? response.json() : [])
      .then((tags: AssetTagOption[]) => setAvailable(tags))
      .catch(() => setAvailable([]));
  }, [type]);

  function commit(next: string[]) {
    const normalized = unique(next);
    if (value === undefined) setInternalValue(normalized);
    onChange?.(normalized);
  }

  async function createTag(tagName: string) {
    const response = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name: tagName })
    });
    if (!response.ok) return "";
    const created = await response.json() as AssetTagOption;
    setAvailable((current) => current.some((tag) => tag.id === created.id) ? current : [...current, created]);
    return created.name;
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={selected.join(",")} /> : null}
      <MultiSelect
        options={available.map((tag) => ({ value: tag.name, label: tag.name, meta: tag.usageCount }))}
        value={selected}
        onValueChange={commit}
        onCreate={createTag}
        normalize={normalizeTagName}
        placeholder={placeholder}
      />
    </>
  );
}
