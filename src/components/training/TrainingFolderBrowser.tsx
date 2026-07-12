"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderPlus } from "lucide-react";
import { FormToast } from "@/components/admin/FormToast";
import { TrainingFolderCard } from "@/components/training/TrainingFolderCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isAdminLoggedIn } from "@/lib/adminSession";
import { normalizeTrainingName } from "@/lib/trainingUtils";
import type { TrainingFolder } from "@/types/training";

export function TrainingFolderBrowser({ initialFolders, searchIndex }: { initialFolders: TrainingFolder[]; searchIndex: Record<string, string> }) {
  const [folders, setFolders] = useState(initialFolders);
  const [keyword, setKeyword] = useState("");
  const [folderId, setFolderId] = useState("");
  const [admin, setAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);

  useEffect(() => { void isAdminLoggedIn().then(setAdmin); }, []);

  const filtered = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase();
    return folders.filter((folder) => (!folderId || folder.id === folderId) && (!query || `${folder.name} ${searchIndex[folder.id] ?? ""}`.toLocaleLowerCase().includes(query)));
  }, [folderId, folders, keyword, searchIndex]);

  async function createFolder() {
    const name = newName.trim().replace(/\s+/g, " ");
    if (!name) return;
    const existing = folders.find((folder) => normalizeTrainingName(folder.name) === normalizeTrainingName(name));
    if (existing) {
      setFolderId(existing.id);
      setCreating(false);
      setNewName("");
      setToast({ message: "已选择同名历史文件夹。" });
      return;
    }
    const response = await fetch("/api/training/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const result = await response.json() as TrainingFolder & { message?: string };
    if (!response.ok) {
      setToast({ message: result.message ?? "文件夹创建失败。", tone: "error" });
      return;
    }
    const folder: TrainingFolder = { ...result, videoCount: 0, updatedAt: result.updatedAt ?? result.createdAt };
    setFolders((current) => [folder, ...current]);
    setFolderId(folder.id);
    setCreating(false);
    setNewName("");
    setToast({ message: "文件夹创建成功。" });
  }

  return (
    <section className="mt-12">
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      <div className="flex flex-col gap-3 border-y border-foreground/[0.1] py-4 md:flex-row md:items-center">
        <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索视频或文件夹" className="min-w-0 flex-1" />
        <Select value={folderId} onChange={(event) => setFolderId(event.target.value)} className="md:w-56"><option value="">全部文件夹</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select>
        {admin ? <Button type="button" onClick={() => setCreating((value) => !value)}><FolderPlus size={16} />新建文件夹</Button> : null}
      </div>
      {creating ? <div className="flex flex-col gap-3 border-b border-foreground/[0.1] bg-white p-4 sm:flex-row"><Input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createFolder(); }} placeholder="输入文件夹名称" className="min-w-0 flex-1" /><Button type="button" variant="secondary" onClick={() => void createFolder()}>创建并选中</Button></div> : null}
      <div className="mt-10 grid gap-x-6 gap-y-12 md:grid-cols-2 lg:grid-cols-3">{filtered.map((folder) => <TrainingFolderCard key={folder.id} folder={folder} />)}</div>
      {!filtered.length ? <p className="py-16 text-center text-muted-foreground">暂无符合条件的资料文件夹。</p> : null}
    </section>
  );
}
