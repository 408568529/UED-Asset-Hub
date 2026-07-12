"use client";

import { useCallback, useEffect, useState } from "react";
import { Combobox } from "@/components/ui/combobox";
import Link from "next/link";
import { normalizeTrainingName } from "@/lib/trainingUtils";
import type { TrainingFolder } from "@/types/training";

export function TrainingFolderField({ folders, value, onChange, onCreated }: { folders: TrainingFolder[]; value: string; onChange: (name: string) => void; onCreated: (folder: TrainingFolder) => void }) {
  const [availableFolders, setAvailableFolders] = useState(folders);

  const loadFolders = useCallback(() => {
    fetch("/api/training/groups")
      .then((response) => response.ok ? response.json() : [])
      .then((result: TrainingFolder[]) => setAvailableFolders(result))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setAvailableFolders(folders);
  }, [folders]);

  useEffect(() => {
    loadFolders();
    window.addEventListener("focus", loadFolders);
    return () => window.removeEventListener("focus", loadFolders);
  }, [loadFolders]);

  async function createFolder(name: string) {
    const existing = availableFolders.find((folder) => normalizeTrainingName(folder.name) === normalizeTrainingName(name));
    if (existing) return existing.name;
    const response = await fetch("/api/taxonomy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "training-folder", name })
    });
    if (!response.ok) return "";
    const result = await response.json() as TrainingFolder;
    const folder = { ...result, videoCount: result.videoCount ?? 0, updatedAt: result.updatedAt ?? result.createdAt };
    setAvailableFolders((current) => [folder, ...current]);
    onCreated(folder);
    return folder.name;
  }

  return (
    <div className="space-y-2"><Combobox
      required
      options={availableFolders.map((folder) => ({ value: folder.name, label: folder.name, meta: `${folder.videoCount} videos` }))}
      value={value}
      onValueChange={onChange}
      onCreate={createFolder}
      normalize={normalizeTrainingName}
      placeholder="搜索历史文件夹，或输入名称快速新建"
    /><Link href="/admin/settings/base-data" className="inline-block text-xs font-bold text-muted-foreground underline underline-offset-4 hover:text-foreground">管理历史选项 →</Link></div>
  );
}
