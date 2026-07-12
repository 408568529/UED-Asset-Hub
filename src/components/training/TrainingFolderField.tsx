"use client";

import { Combobox } from "@/components/ui/combobox";
import { normalizeTrainingName } from "@/lib/trainingUtils";
import type { TrainingFolder } from "@/types/training";

export function TrainingFolderField({ folders, value, onChange, onCreated }: { folders: TrainingFolder[]; value: string; onChange: (name: string) => void; onCreated: (folder: TrainingFolder) => void }) {
  async function createFolder(name: string) {
    const existing = folders.find((folder) => normalizeTrainingName(folder.name) === normalizeTrainingName(name));
    if (existing) return existing.name;
    const response = await fetch("/api/training/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    if (!response.ok) return "";
    const result = await response.json() as TrainingFolder;
    const folder = { ...result, videoCount: result.videoCount ?? 0, updatedAt: result.updatedAt ?? result.createdAt };
    onCreated(folder);
    return folder.name;
  }

  return (
    <Combobox
      required
      options={folders.map((folder) => ({ value: folder.name, label: folder.name, meta: `${folder.videoCount} videos` }))}
      value={value}
      onValueChange={onChange}
      onCreate={createFolder}
      normalize={normalizeTrainingName}
      placeholder="搜索历史文件夹，或输入名称快速新建"
    />
  );
}
