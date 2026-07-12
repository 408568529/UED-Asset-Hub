"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { FormToast } from "@/components/admin/FormToast";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TaxonomyDeleteRequest, TaxonomyItem, TaxonomyType } from "@/types/taxonomy";

const groups: { label: string; types: { type: TaxonomyType; label: string }[] }[] = [
  { label: "标签", types: [{ type: "product-tag", label: "Vibe Product 标签" }, { type: "component-tag", label: "组件规范标签" }, { type: "sop-tag", label: "标准 SOP 标签" }, { type: "skill-tag", label: "Skill 标签" }, { type: "font-tag", label: "字体标签" }, { type: "prompt-tag", label: "Prompt 标签" }, { type: "training-tag", label: "培训资料标签" }, { type: "test-environment-tag", label: "测试环境标签" }] },
  { label: "使用场景", types: [{ type: "skill-usage", label: "Skill 使用场景" }, { type: "prompt-usage", label: "Prompt 使用场景" }] },
  { label: "培训资料文件夹", types: [{ type: "training-folder", label: "资料分组" }] },
  { label: "Prompt 分类", types: [{ type: "prompt-category", label: "Prompt 分类" }] },
  { label: "Skill 分类", types: [{ type: "skill-category", label: "Skill 分类" }] }
];

const allTypes = groups.flatMap((group) => group.types);

function date(value: string) {
  return value ? value.slice(0, 10) : "-";
}

export function BaseDataManager() {
  const [type, setType] = useState<TaxonomyType>("skill-tag");
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [newName, setNewName] = useState("");
  const [renameTarget, setRenameTarget] = useState<TaxonomyItem | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TaxonomyItem | null>(null);
  const [deleteMode, setDeleteMode] = useState<TaxonomyDeleteRequest["mode"]>("remove");
  const [replacementId, setReplacementId] = useState("");
  const [dangerConfirm, setDangerConfirm] = useState("");
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);

  const selectedLabel = allTypes.find((item) => item.type === type)?.label ?? "基础数据";
  const replacementItems = useMemo(() => items.filter((item) => item.id !== deleteTarget?.id), [deleteTarget?.id, items]);

  const load = useCallback(async (nextType = type) => {
    const response = await fetch(`/api/taxonomy?type=${encodeURIComponent(nextType)}`, { cache: "no-store" });
    setItems(response.ok ? await response.json() as TaxonomyItem[] : []);
  }, [type]);

  useEffect(() => { void load(); }, [load]);

  const filtered = items.filter((item) => !keyword.trim() || item.name.toLocaleLowerCase().includes(keyword.trim().toLocaleLowerCase()));

  async function create() {
    const response = await fetch("/api/taxonomy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, name: newName }) });
    const result = await response.json() as TaxonomyItem & { message?: string };
    if (!response.ok) { setToast({ message: result.message ?? "创建失败。", tone: "error" }); return; }
    setNewName("");
    await load();
    setToast({ message: `已创建“${result.name}”。` });
  }

  async function rename() {
    if (!renameTarget) return;
    const response = await fetch("/api/taxonomy", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id: renameTarget.id, name: renameName }) });
    const result = await response.json() as TaxonomyItem & { message?: string; usageCount?: number };
    if (!response.ok) { setToast({ message: result.message ?? "重命名失败。", tone: "error" }); return; }
    setRenameTarget(null);
    await load();
    setToast({ message: `重命名成功，已同步 ${result.usageCount ?? 0} 个引用。` });
  }

  async function remove() {
    if (!deleteTarget) return;
    let request: TaxonomyDeleteRequest;
    if (type === "training-folder") {
      request = deleteMode === "move" ? { mode: "move", targetFolderId: replacementId } : deleteMode === "delete-videos" ? { mode: "delete-videos" } : { mode: "uncategorize" };
    } else {
      request = deleteMode === "replace" ? { mode: "replace", replacementId } : { mode: "remove" };
    }
    const response = await fetch("/api/taxonomy", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, id: deleteTarget.id, request }) });
    const result = await response.json() as { deleted?: boolean; affected?: number; message?: string };
    if (!response.ok || !result.deleted) { setToast({ message: result.message ?? "删除失败。", tone: "error" }); return; }
    setDeleteTarget(null);
    await load();
    setToast({ message: `已删除，处理 ${result.affected ?? 0} 个引用。` });
  }

  function openDelete(item: TaxonomyItem) {
    setDeleteTarget(item);
    setReplacementId("");
    setDangerConfirm("");
    setDeleteMode(type === "training-folder" ? "uncategorize" : "remove");
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="border-l border-border">
        {groups.map((group) => <div key={group.label} className="mb-6"><p className="mb-2 pl-4 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">{group.label}</p>{group.types.map((item) => <button key={item.type} type="button" onClick={() => setType(item.type)} className={`block w-full border-l-2 px-4 py-2 text-left text-sm ${type === item.type ? "-ml-px border-foreground bg-muted font-bold" : "-ml-px border-transparent text-muted-foreground hover:text-foreground"}`}>{item.label}</button>)}</div>)}
      </aside>
      <section>
        <div className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
          <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Base Data</p><h2 className="mt-2 text-2xl font-black">{selectedLabel}</h2></div>
          <div className="flex w-full gap-2 md:w-auto"><Input value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void create(); }} placeholder="输入名称后新建" className="md:w-64" /><Button type="button" onClick={() => void create()} disabled={!newName.trim()}><Plus size={16} />新建</Button></div>
        </div>
        <div className="mt-5 flex max-w-md items-center gap-2"><Search size={16} className="text-muted-foreground" /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索名称" /></div>
        <div className="mt-5 overflow-x-auto"><Table className="min-w-[620px]"><TableHeader><TableRow><TableHead>名称</TableHead><TableHead>引用数量</TableHead><TableHead>更新时间</TableHead><TableHead className="w-44">操作</TableHead></TableRow></TableHeader><TableBody>{filtered.map((item) => <TableRow key={item.id}><TableCell className="font-bold">{item.name}</TableCell><TableCell className="font-mono">{item.usageCount}</TableCell><TableCell className="font-mono text-muted-foreground">{date(item.updatedAt)}</TableCell><TableCell><div className="flex gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => { setRenameTarget(item); setRenameName(item.name); }}><Pencil size={14} />重命名</Button><Button type="button" size="sm" variant="ghost" onClick={() => openDelete(item)}><Trash2 size={14} />删除</Button></div></TableCell></TableRow>)}</TableBody></Table>{!filtered.length ? <p className="py-14 text-center text-sm text-muted-foreground">暂无历史选项。</p> : null}</div>
      </section>
      {renameTarget ? <Dialog label="重命名基础数据"><p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Rename</p><h3 className="mt-3 text-2xl font-black">重命名“{renameTarget.name}”</h3><p className="mt-4 text-sm leading-7 text-muted-foreground">该选项当前被 {renameTarget.usageCount} 个资产使用。保存后会同步更新所有关联资产。</p><div className="mt-6"><Input value={renameName} onChange={(event) => setRenameName(event.target.value)} autoFocus /></div><div className="mt-7 flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setRenameTarget(null)}>取消</Button><Button type="button" onClick={() => void rename()} disabled={!renameName.trim()}>确认重命名</Button></div></Dialog> : null}
      {deleteTarget ? <Dialog label="删除基础数据"><p className="font-mono text-xs uppercase tracking-[0.18em] text-destructive">Delete</p><h3 className="mt-3 text-2xl font-black">删除“{deleteTarget.name}”</h3><p className="mt-4 text-sm leading-7 text-muted-foreground">当前有 {deleteTarget.usageCount} 个引用。请先选择关联内容的处理方式。</p>{type === "training-folder" ? <div className="mt-5 space-y-3"><Select value={deleteMode} onChange={(event) => setDeleteMode(event.target.value as TaxonomyDeleteRequest["mode"])}><option value="uncategorize">移动到“未分类资料”</option><option value="move">移动到其他文件夹</option><option value="delete-videos">同时删除文件夹及全部视频源文件</option></Select>{deleteMode === "move" ? <Select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">选择目标文件夹</option>{replacementItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select> : null}{deleteMode === "delete-videos" ? <div className="space-y-2"><p className="text-sm font-bold text-destructive">危险操作：平台记录及实际视频源文件都会被删除。</p><Input value={dangerConfirm} onChange={(event) => setDangerConfirm(event.target.value)} placeholder={`输入“${deleteTarget.name}”确认`} /></div> : null}</div> : deleteTarget.usageCount ? <div className="mt-5 space-y-3"><Select value={deleteMode} onChange={(event) => setDeleteMode(event.target.value as TaxonomyDeleteRequest["mode"])}><option value="remove">从所有关联资产中移除</option><option value="replace">替换为其他已有选项</option></Select>{deleteMode === "replace" ? <Select value={replacementId} onChange={(event) => setReplacementId(event.target.value)}><option value="">选择替换选项</option>{replacementItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select> : null}</div> : <p className="mt-5 text-sm text-muted-foreground">该选项未被引用，确认后会直接删除。</p>}<div className="mt-7 flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>取消</Button><Button type="button" variant="destructive" onClick={() => void remove()} disabled={((deleteMode === "replace" || deleteMode === "move") && !replacementId) || (deleteMode === "delete-videos" && dangerConfirm !== deleteTarget.name)}>确认删除</Button></div></Dialog> : null}
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
    </div>
  );
}
