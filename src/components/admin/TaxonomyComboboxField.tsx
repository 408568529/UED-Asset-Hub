"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import type { TaxonomyItem, TaxonomyType } from "@/types/taxonomy";

export function TaxonomyComboboxField({ type, name, defaultValue, placeholder }: { type: TaxonomyType; name: string; defaultValue: string; placeholder: string }) {
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<TaxonomyItem[]>([]);

  const loadItems = useCallback(() => {
    fetch(`/api/taxonomy?type=${encodeURIComponent(type)}`)
      .then((response) => response.ok ? response.json() : [])
      .then((result: TaxonomyItem[]) => setItems(result))
      .catch(() => setItems([]));
  }, [type]);

  useEffect(() => {
    loadItems();
    window.addEventListener("focus", loadItems);
    return () => window.removeEventListener("focus", loadItems);
  }, [loadItems]);

  async function create(nameValue: string) {
    const response = await fetch("/api/taxonomy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, name: nameValue }) });
    if (!response.ok) return "";
    const item = await response.json() as TaxonomyItem;
    setItems((current) => current.some((entry) => entry.id === item.id) ? current : [item, ...current]);
    return item.name;
  }

  return <div className="space-y-2"><input type="hidden" name={name} value={value} /><Combobox required options={items.map((item) => ({ value: item.name, label: item.name, meta: item.usageCount }))} value={value} onValueChange={setValue} onCreate={create} placeholder={placeholder} /><Link href="/admin/settings/base-data" className="inline-block text-xs font-bold text-muted-foreground underline underline-offset-4 hover:text-foreground">管理历史选项 →</Link></div>;
}
