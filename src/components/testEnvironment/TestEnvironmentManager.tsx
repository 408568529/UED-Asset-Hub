"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { DeleteConfirmDialog } from "@/components/admin/DeleteConfirmDialog";
import { FormToast } from "@/components/admin/FormToast";
import { TagMultiSelectField } from "@/components/admin/TagMultiSelectField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClientId } from "@/lib/clientId";
import type { SafeTestEnvironment, TestEnvironmentInput, TestEnvironmentType } from "@/types/testEnvironment";

type Draft = TestEnvironmentInput & { id: string; isNew?: boolean };
const types: TestEnvironmentType[] = ["UAT", "TEST", "DEMO", "OTHER"];

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return true; } catch {}
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  return copied;
}

function toDraft(item: SafeTestEnvironment): Draft {
  return { id: item.id, productName: item.productName, clientVersionName: item.clientVersionName, environmentType: item.environmentType, environmentUrl: item.environmentUrl ?? "", username: item.username, password: "", description: item.description ?? "", tags: item.tags ?? [], status: item.status };
}

export function TestEnvironmentManager({ adminMode = false }: { adminMode?: boolean }) {
  const [environments, setEnvironments] = useState<SafeTestEnvironment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SafeTestEnvironment | null>(null);
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" | "warning" } | null>(null);

  function showToast(message: string, tone: "success" | "error" | "warning" = "success") {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/test-environments")
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) throw new Error();
        const items = await response.json() as SafeTestEnvironment[];
        setEnvironments(items);
        setDrafts(Object.fromEntries(items.map((item) => [item.id, toDraft(item)])));
      })
      .catch(() => active && showToast("测试环境读取失败，请重新登录。", "error"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase();
    return environments.filter((item) => !query || [item.productName, item.clientVersionName, item.environmentType, item.environmentUrl, item.username, item.description, ...item.tags].filter(Boolean).join(" ").toLocaleLowerCase().includes(query));
  }, [environments, keyword]);

  function update<K extends keyof Draft>(id: string, key: K, value: Draft[K]) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }

  function addRow() {
    const id = createClientId("new-");
    const now = new Date().toISOString();
    const item: SafeTestEnvironment = { id, productName: "", clientVersionName: "", environmentType: "UAT", environmentName: "", environmentUrl: "", username: "", description: "", tags: [], status: "available", createdBy: "admin", createdAt: now, updatedAt: now };
    setEnvironments((current) => [item, ...current]);
    setDrafts((current) => ({ ...current, [id]: { ...toDraft(item), isNew: true } }));
    setEditing((current) => new Set(current).add(id));
  }

  function cancel(id: string) {
    const draft = drafts[id];
    if (draft?.isNew) {
      setEnvironments((current) => current.filter((item) => item.id !== id));
      setDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
    } else {
      const item = environments.find((environment) => environment.id === id);
      if (item) setDrafts((current) => ({ ...current, [id]: toDraft(item) }));
    }
    setEditing((current) => { const next = new Set(current); next.delete(id); return next; });
  }

  async function save(id: string) {
    const draft = drafts[id];
    if (!draft.productName.trim() || !draft.clientVersionName.trim() || !draft.username.trim() || (draft.isNew && !draft.password)) {
      showToast("请填写产品、客户版本、账号和密码。", "error");
      return;
    }
    setSaving(id);
    const response = await fetch(draft.isNew ? "/api/test-environments" : `/api/test-environments/${id}`, {
      method: draft.isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, environmentName: undefined, status: undefined })
    });
    const result = await response.json().catch(() => ({})) as { data?: SafeTestEnvironment; warning?: string; message?: string };
    setSaving(null);
    if (!response.ok || !result.data) {
      showToast(result.message ?? "测试环境保存失败。", "error");
      return;
    }
    setEnvironments((current) => current.map((item) => item.id === id ? result.data as SafeTestEnvironment : item));
    setDrafts((current) => { const next = { ...current }; delete next[id]; next[result.data!.id] = toDraft(result.data!); return next; });
    setEditing((current) => { const next = new Set(current); next.delete(id); return next; });
    showToast(result.warning ?? "测试环境已保存。", result.warning ? "warning" : "success");
  }

  async function getPassword(item: SafeTestEnvironment, action: "reveal" | "copy-password") {
    const response = await fetch(`/api/test-environments/${item.id}/reveal-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const result = await response.json() as { password?: string; warning?: string; message?: string };
    if (!response.ok || !result.password) { showToast(result.message ?? "密码读取失败。", "error"); return null; }
    if (result.warning) showToast(result.warning, "error");
    return result.password;
  }

  async function reveal(item: SafeTestEnvironment) {
    if (revealed[item.id]) { setRevealed((current) => { const next = { ...current }; delete next[item.id]; return next; }); return; }
    const password = await getPassword(item, "reveal");
    if (password) setRevealed((current) => ({ ...current, [item.id]: password }));
  }

  async function copyUsername(item: SafeTestEnvironment) {
    if (!await copyText(item.username)) { showToast("复制失败，请手动复制。", "error"); return; }
    await fetch(`/api/test-environments/${item.id}/audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "copy-username" }) });
    showToast("账号已复制。");
  }

  async function copyPassword(item: SafeTestEnvironment) {
    const password = await getPassword(item, "copy-password");
    if (!password) return;
    const copied = await copyText(password);
    showToast(copied ? "密码已复制。" : "复制失败，请手动复制。", copied ? "success" : "error");
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const response = await fetch(`/api/test-environments/${deleteTarget.id}`, { method: "DELETE" });
    if (response.ok) { setEnvironments((current) => current.filter((item) => item.id !== deleteTarget.id)); showToast("测试环境已删除。"); }
    else showToast("删除失败，请稍后重试。", "error");
    setDeleteTarget(null);
  }

  return (
    <section>
      {toast ? <FormToast message={toast.message} tone={toast.tone} /> : null}
      <div className="flex flex-col gap-3 border-y border-foreground/[0.1] py-4 md:flex-row md:items-center md:justify-between">
        <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索产品、版本、环境地址或账号" className="min-w-0 flex-1 md:max-w-lg" />
        <div className="flex items-center gap-3">{adminMode ? <Button type="button" onClick={addRow}><Plus size={16} />新增一行</Button> : null}</div>
      </div>
      {loading ? <p className="py-12 text-muted-foreground">正在读取测试环境...</p> : null}
      {!loading ? <div className="overflow-x-auto"><Table className="mt-6 min-w-[1460px] table-fixed"><colgroup><col className="w-[180px]" /><col className="w-[160px]" /><col className="w-[120px]" /><col className="w-[300px]" /><col className="w-[160px]" /><col className="w-[180px]" /><col className="w-[240px]" /><col className="w-[180px]" /></colgroup><TableHeader><TableRow className="border-foreground/[0.14]"><TableHead>产品名称</TableHead><TableHead>客户版本</TableHead><TableHead>环境类型</TableHead><TableHead>环境地址</TableHead><TableHead>账号</TableHead><TableHead>密码</TableHead><TableHead>说明</TableHead><TableHead className="text-right">操作</TableHead></TableRow></TableHeader><TableBody>
        {filtered.map((item) => {
          const draft = drafts[item.id] ?? toDraft(item);
          const isEditing = editing.has(item.id);
          return <Fragment key={item.id}><TableRow>
            <TableCell>{isEditing ? <Input controlSize="sm" value={draft.productName} onChange={(event) => update(item.id, "productName", event.target.value)} /> : <span className="block truncate" title={item.productName}>{item.productName}</span>}</TableCell>
            <TableCell>{isEditing ? <Input controlSize="sm" value={draft.clientVersionName} onChange={(event) => update(item.id, "clientVersionName", event.target.value)} /> : <span className="block truncate" title={item.clientVersionName}>{item.clientVersionName}</span>}</TableCell>
            <TableCell>{isEditing ? <Select controlSize="sm" value={draft.environmentType} onChange={(event) => update(item.id, "environmentType", event.target.value as TestEnvironmentType)}>{types.map((type) => <option key={type}>{type}</option>)}</Select> : item.environmentType}</TableCell>
            <TableCell>{isEditing ? <Input controlSize="sm" type="url" value={draft.environmentUrl} onChange={(event) => update(item.id, "environmentUrl", event.target.value)} /> : item.environmentUrl ? <a href={item.environmentUrl} target="_blank" rel="noreferrer" title={item.environmentUrl} className="block truncate underline decoration-foreground/30 underline-offset-4">{item.environmentUrl} ↗</a> : "—"}</TableCell>
            <TableCell>{isEditing ? <Input controlSize="sm" value={draft.username} onChange={(event) => update(item.id, "username", event.target.value)} /> : <div className="flex min-w-0 items-center gap-2"><span className="truncate" title={item.username}>{item.username}</span><Button type="button" size="icon" variant="ghost" onClick={() => void copyUsername(item)} aria-label="复制账号" className="h-8 w-8"><Copy size={14} /></Button></div>}</TableCell>
            <TableCell>{isEditing ? <Input controlSize="sm" type="password" value={draft.password ?? ""} onChange={(event) => update(item.id, "password", event.target.value)} placeholder={draft.isNew ? "必填" : "留空不修改"} /> : <div className="flex items-center gap-1"><span className="min-w-0 flex-1 truncate" title={revealed[item.id]}>{revealed[item.id] ?? "••••••••"}</span><Button type="button" size="icon" variant="ghost" onClick={() => void reveal(item)} aria-label={revealed[item.id] ? "隐藏密码" : "显示密码"} className="h-8 w-8">{revealed[item.id] ? <EyeOff size={14} /> : <Eye size={14} />}</Button><Button type="button" size="icon" variant="ghost" onClick={() => void copyPassword(item)} aria-label="复制密码" className="h-8 w-8"><Copy size={14} /></Button></div>}</TableCell>
            <TableCell>{isEditing ? <Input controlSize="sm" value={draft.description} onChange={(event) => update(item.id, "description", event.target.value)} /> : <span className="block truncate" title={item.description}>{item.description || "—"}</span>}</TableCell>
            <TableCell><div className="flex justify-end gap-1">{isEditing ? <><Button type="button" size="sm" disabled={saving === item.id} onClick={() => void save(item.id)}><Check size={14} />保存</Button><Button type="button" size="sm" variant="ghost" onClick={() => cancel(item.id)}><X size={14} />取消</Button></> : adminMode ? <><Button type="button" size="sm" variant="ghost" onClick={() => void reveal(item)}>查看</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing((current) => new Set(current).add(item.id))}><Pencil size={14} />编辑</Button><Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(item)} className="text-destructive hover:bg-destructive hover:text-white"><Trash2 size={14} />删除</Button></> : null}</div></TableCell>
          </TableRow>{isEditing ? <TableRow className="bg-foreground/[0.02]"><TableCell colSpan={8}><div className="grid gap-3 md:grid-cols-[120px_1fr] md:items-start"><span className="pt-3 text-xs font-bold text-muted-foreground">标签</span><TagMultiSelectField type="test-environment-tag" value={draft.tags} onChange={(tags) => update(item.id, "tags", tags)} /></div></TableCell></TableRow> : null}</Fragment>;
        })}
      </TableBody></Table></div> : null}
      {!loading && !filtered.length ? <p className="py-12 text-muted-foreground">暂无符合条件的测试环境。</p> : null}
      {deleteTarget ? <DeleteConfirmDialog assetName={`${deleteTarget.productName} ${deleteTarget.clientVersionName}`} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} /> : null}
    </section>
  );
}
