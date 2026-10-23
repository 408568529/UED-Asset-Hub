"use client";

import { WorkspaceRowActions } from "@/components/layout/WorkspaceRowActions";
import { Download, File, Folder, FolderPlus, MoreHorizontal, MoveRight, Pencil, RefreshCw, ShieldAlert, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertDialog } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu-primitive";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HaldurUploadQueue } from "@/components/haldur/HaldurUploadQueue";
import { HaldurFilePreviewModal } from "@/components/haldur/HaldurFilePreviewModal";
import { HaldurMarkdownDocumentPanel, type HaldurMarkdownDocument } from "@/components/haldur/HaldurMarkdownDocumentPanel";
import type { HaldurDesignSkillNode, HaldurDesignSkillSnapshot } from "@/types/haldurDesignSkill";

type DialogState = null | { type: "create" } | { type: "rename"; node: HaldurDesignSkillNode } | { type: "move"; node: HaldurDesignSkillNode } | { type: "delete"; node: HaldurDesignSkillNode };

function joinPath(parent: string, name: string) { return [parent, name].filter(Boolean).join("/"); }
function parentPath(value: string) { return value.includes("/") ? value.slice(0, value.lastIndexOf("/")) : ""; }
function formatSize(size: number) { if (!size) return "—"; const units = ["B", "KB", "MB", "GB"]; const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1); return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date); }

function findDirectory(nodes: HaldurDesignSkillNode[], relativePath: string): HaldurDesignSkillNode | undefined {
  if (!relativePath) return undefined;
  for (const node of nodes) {
    if (node.relativePath === relativePath && node.type === "directory") return node;
    const found = node.children ? findDirectory(node.children, relativePath) : undefined;
    if (found) return found;
  }
}

function nearestDirectory(nodes: HaldurDesignSkillNode[], relativePath: string) {
  let current = relativePath;
  while (current) { if (findDirectory(nodes, current)) return current; current = parentPath(current); }
  return "";
}

function directoryOptions(nodes: HaldurDesignSkillNode[], depth = 0): Array<{ path: string; name: string; depth: number }> {
  return nodes.flatMap((node) => node.type === "directory" ? [{ path: node.relativePath, name: node.name, depth }, ...directoryOptions(node.children ?? [], depth + 1)] : []);
}

function ApiError({ message }: { message: string }) { return <p role="alert" className="border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">{message}</p>; }

export function HaldurDesignSkillWorkbench({ canManage = false, initialFile }: { canManage?: boolean; initialFile?: string }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<HaldurDesignSkillSnapshot | null>(null);
  const [selectedDirectory, setSelectedDirectory] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [value, setValue] = useState("");
  const [moveTarget, setMoveTarget] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<HaldurMarkdownDocument | null>(null);
  const [downloading, setDownloading] = useState(false);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const workbench = useRef<HTMLElement>(null);
  const readOnly = Boolean(snapshot?.recoveryRequired);

  const reload = async (preservePath = true) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/haldur-design-skill", { cache: "no-store" });
      const next = await response.json() as HaldurDesignSkillSnapshot;
      setSnapshot(next);
      if (!response.ok || !next.rootAvailable) { setError(next.diagnostics?.[0]?.message ?? "Haldur-Design-Skill 当前不可用。"); return; }
      setSelectedDirectory((current) => preservePath ? nearestDirectory(next.nodes, current) : "");
    } catch { setError("无法读取 Haldur-Design-Skill，请稍后重试。"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(false); }, []);
  useEffect(() => {
    const updateSession = () => router.refresh();
    window.addEventListener("ued-admin-session-change", updateSession);
    return () => window.removeEventListener("ued-admin-session-change", updateSession);
  }, [router]);
  const current = selectedDirectory ? findDirectory(snapshot?.nodes ?? [], selectedDirectory) : undefined;
  const entries = selectedDirectory ? current?.children ?? [] : snapshot?.nodes ?? [];
  const directories = useMemo(() => directoryOptions(snapshot?.nodes ?? []), [snapshot]);
  const crumbs = selectedDirectory ? selectedDirectory.split("/") : [];

  function selectDirectory(relativePath: string) { setSelectedDirectory(relativePath); setExpanded((current) => new Set([...current, ...relativePath.split("/").map((_, index, parts) => parts.slice(0, index + 1).join("/"))])); }
  async function openMarkdown(node: Pick<HaldurDesignSkillNode, "name" | "relativePath">) {
    if (/\.(html?|svg|png|jpe?g|webp|gif)$/i.test(node.name)) { setPreviewPath(node.relativePath); return; }
    if (!/\.md$/i.test(node.name)) return;
    setNotice(null); setLoading(true);
    try {
      const response = await fetch(`/api/haldur-design-skill/files/content?path=${encodeURIComponent(node.relativePath)}`, { cache: "no-store" });
      const payload = await response.json() as HaldurMarkdownDocument & { code?: string; message?: string };
      if (!response.ok || !payload.content && payload.content !== "") { setNotice(payload.message ?? "无法读取 Markdown 文件。"); return; }
      setMarkdown(payload);
    } catch { setNotice("无法读取 Markdown 文件，请稍后重试。"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (!initialFile || !snapshot?.rootAvailable) return;
    selectDirectory(parentPath(initialFile));
    void openMarkdown({ name: initialFile.split("/").pop() ?? "", relativePath: initialFile });
  }, [initialFile, snapshot?.rootAvailable]);
  function apiFailure(payload: { code?: string; message?: string }) {
    if (payload.code === "REVISION_CONFLICT") setNotice("Haldur-Design-Skill 已发生变化。请刷新后确认最新内容，再重新执行操作。");
    else if (payload.code === "RECOVERY_REQUIRED") { setSnapshot((current) => current ? { ...current, recoveryRequired: true } : current); setNotice("当前 Haldur-Design-Skill 存在未完成的文件事务，写操作已暂时停用。"); }
    else setNotice(payload.message ?? "操作未完成，请检查后重试。");
  }
  async function mutation(url: string, init: RequestInit) {
    if (!snapshot?.revision || readOnly) return false;
    setSubmitting(true); setNotice(null);
    try {
      const response = await fetch(url, { ...init, headers: { "if-match": snapshot.revision, ...(init.headers ?? {}) } });
      if (!response.ok) { apiFailure(await response.json().catch(() => ({}))); return false; }
      await reload(); return true;
    } catch { setNotice("网络异常，未确认操作结果。请刷新后核对真实目录。"); return false; }
    finally { setSubmitting(false); }
  }
  async function submitDialog() {
    if (!dialog || !value.trim()) return;
    let success = false;
    if (dialog.type === "create") success = await mutation("/api/haldur-design-skill/directories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ parentRelativePath: selectedDirectory, directoryName: value.trim() }) });
    if (dialog.type === "rename") success = await mutation(dialog.node.type === "directory" ? "/api/haldur-design-skill/directories" : "/api/haldur-design-skill/files", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "rename", sourceRelativePath: dialog.node.relativePath, [dialog.node.type === "directory" ? "directoryName" : "newFileName"]: value.trim() }) });
    if (success) { setDialog(null); setValue(""); }
  }
  async function submitMove() {
    if (!dialog || dialog.type !== "move") return;
    const endpoint = dialog.node.type === "directory" ? "/api/haldur-design-skill/directories" : "/api/haldur-design-skill/files";
    const success = await mutation(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "move", sourceRelativePath: dialog.node.relativePath, targetParentRelativePath: moveTarget }) });
    if (success) setDialog(null);
  }
  async function submitDelete() {
    if (!dialog || dialog.type !== "delete") return;
    const endpoint = dialog.node.type === "directory" ? "/api/haldur-design-skill/directories" : "/api/haldur-design-skill/files";
    const success = await mutation(endpoint, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceRelativePath: dialog.node.relativePath }) });
    if (success) setDialog(null);
  }
  function restoreDialogFocus(event: Event) {
    event.preventDefault();
    const trigger = dialogTrigger.current;
    const target = trigger?.isConnected && !trigger.matches(":disabled") && trigger.getClientRects().length ? trigger : workbench.current;
    target?.focus({ preventScroll: true });
  }
  function download(node: HaldurDesignSkillNode) { window.location.assign(`/api/haldur-design-skill/files?path=${encodeURIComponent(node.relativePath)}`); }
  async function downloadSkill() {
    if (readOnly) { setNotice("当前 Skill 处于只读恢复状态，暂时无法生成完整下载包。"); return; }
    setDownloading(true); setNotice(null);
    try {
      const response = await fetch("/api/haldur-design-skill/download");
      if (!response.ok) { apiFailure(await response.json().catch(() => ({}))); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "Haldur-Design-Skill.zip"; anchor.click(); URL.revokeObjectURL(url);
    } catch { setNotice("生成 Skill 下载包失败，请稍后重试。"); }
    finally { setDownloading(false); }
  }

  function Tree({ nodes, depth = 0 }: { nodes: HaldurDesignSkillNode[]; depth?: number }) {
    return <>{nodes.filter((node) => node.type === "directory").map((node) => {
      const open = expanded.has(node.relativePath); const active = selectedDirectory === node.relativePath;
      return <div key={node.relativePath}>
        <div className={`workspace-folder-row ${active ? "is-selected" : ""}`} style={{ paddingLeft: `${depth * 14 + 8}px` }}>
          {node.children?.some((child) => child.type === "directory") ? <button type="button" className="flex h-10 w-5 shrink-0 items-center justify-center text-xs text-muted-foreground hover:text-foreground" aria-label={`${open ? "收起" : "展开"}${node.name}`} aria-expanded={open} onClick={() => setExpanded((current) => { const next = new Set(current); open ? next.delete(node.relativePath) : next.add(node.relativePath); return next; })}>{open ? "−" : "+"}</button> : <span className="w-5 shrink-0" aria-hidden="true"/>}
          <button type="button" onClick={() => setSelectedDirectory(node.relativePath)} className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 pr-2 text-left text-sm transition ${active ? "text-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}><Folder size={15} className="shrink-0" aria-hidden="true" /><span className="truncate">{node.name}</span></button>{canManage ? <WorkspaceRowActions name={node.name} disabled={readOnly || submitting} onRename={(event) => { dialogTrigger.current = event.currentTarget; setValue(node.name); setDialog({ type: "rename", node }); }} onDelete={(event) => { dialogTrigger.current = event.currentTarget; setDialog({ type: "delete", node }); }}/> : null}</div>
        {open ? <Tree nodes={node.children ?? []} depth={depth + 1} /> : null}
      </div>;
    })}</>;
  }

  if (loading && !snapshot) return <main className="page-shell page-frame"><p className="text-sm text-muted-foreground">正在读取 Haldur-Design-Skill…</p></main>;
  if (!snapshot?.rootAvailable) return <main className="haldur-unavailable-page page-shell page-frame"><section className="haldur-unavailable-content mx-auto max-w-xl border border-destructive/25 bg-[hsl(var(--surface))] p-8 shadow-[var(--shadow-soft)]"><ShieldAlert className="text-destructive" size={28} /><h1 className="mt-5 text-2xl font-black">Haldur-Design-Skill 当前不可用</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{error ?? "未找到已配置的 Skill Root，系统不会自动创建或迁移目录。"}</p><Button className="mt-6" variant="outline" onClick={() => void reload()}>重新加载</Button></section></main>;

  return <main ref={workbench} tabIndex={-1} className="haldur-workbench" id="main-content">
    {uploadOpen ? <HaldurUploadQueue directory={selectedDirectory} snapshot={snapshot} onSnapshot={setSnapshot} onClose={() => { setUploadOpen(false); requestAnimationFrame(() => dialogTrigger.current?.focus({ preventScroll: true })); }} /> : null}
    {previewPath ? <HaldurFilePreviewModal path={previewPath} onClose={() => { setPreviewPath(null); requestAnimationFrame(() => (dialogTrigger.current?.isConnected ? dialogTrigger.current : workbench.current)?.focus({ preventScroll: true })); }} /> : null}

    {readOnly ? <div role="status" className="border-b border-amber-700/25 bg-amber-50 px-[var(--site-gutter)] py-3 text-sm text-amber-950">当前 Haldur-Design-Skill 存在未完成的文件事务，为保护文件安全，写操作已暂时停用。浏览、刷新和下载仍可使用。</div> : null}
    {notice ? <div role="status" className="border-b border-border bg-[hsl(var(--surface-subtle)/0.7)] px-[var(--site-gutter)] py-3 text-sm"><div className="mx-auto flex max-w-[var(--site-max)] items-center justify-between gap-3"><span>{notice}</span>{notice.includes("刷新") ? <Button size="sm" variant="outline" onClick={() => void reload()}>刷新</Button> : <button className="text-muted-foreground" onClick={() => setNotice(null)}>关闭</button>}</div></div> : null}
    <div className="haldur-workbench-body mx-auto grid min-h-[calc(100dvh-var(--app-header-height))] max-w-[var(--site-max)] lg:grid-cols-[16rem_minmax(0,1fr)]"><aside className="border-b border-border bg-[hsl(var(--surface-subtle)/0.5)] p-3 lg:border-b-0 lg:border-r lg:px-4 lg:py-5" aria-label="Skill 目录树"><div className="mb-3 px-2"><p className="text-sm font-black">Skill Library</p><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Haldur-Design-Skill</p></div><button type="button" onClick={() => selectDirectory("")} className={`flex min-h-10 w-full items-center gap-2 px-2 text-left text-sm font-bold ${!selectedDirectory ? "bg-foreground text-white" : "hover:bg-[hsl(var(--surface-raised))]"}`}><Folder size={16} />Haldur-Design-Skill</button><nav className="mt-2" aria-label="Haldur Skill 目录"><Tree nodes={snapshot.nodes} /></nav></aside>
      <div className="min-w-0"><header className="haldur-workbench-toolbar border-b border-border px-6 py-4"><div className="mx-auto flex max-w-[var(--site-max)] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Skill filesystem workbench</p><h1 className="mt-1 text-xl font-black tracking-[-0.025em]">Haldur-Design-Skill</h1></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void downloadSkill()} disabled={downloading}>{downloading ? <RefreshCw size={15} className="animate-spin" /> : <Download size={15} />}{downloading ? "正在生成 Skill…" : "下载 Skill"}</Button><Button variant="outline" onClick={() => void reload()} disabled={loading}><RefreshCw size={15} className={loading ? "animate-spin" : ""} />刷新</Button>{canManage ? <><Button variant="outline" onClick={(event) => { dialogTrigger.current = event.currentTarget; setUploadOpen(true); }} disabled={readOnly || submitting}><Upload size={15} />上传</Button><Button onClick={(event) => { dialogTrigger.current = event.currentTarget; setValue(""); setDialog({ type: "create" }); }} disabled={readOnly || submitting}><FolderPlus size={15} />新建文件夹</Button></> : null}</div></div></header>
      {markdown ? <HaldurMarkdownDocumentPanel key={markdown.path} document={markdown} canManage={canManage} onClose={() => setMarkdown(null)} onSaved={(nextSnapshot) => { setSnapshot(nextSnapshot); setMarkdown(null); setNotice("Markdown 已保存并已更新真实 Skill Root。"); }} /> : <section className="min-w-0 bg-[hsl(var(--surface))]"><div className="border-b border-border px-4 py-4 md:px-6"><nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="当前位置"><button className="font-bold hover:underline" onClick={() => selectDirectory("")}>Haldur-Design-Skill</button>{crumbs.map((crumb, index) => { const path = crumbs.slice(0, index + 1).join("/"); return <span key={path} className="flex items-center gap-1 text-muted-foreground"><span>/</span><button className={index === crumbs.length - 1 ? "font-medium text-foreground" : "hover:text-foreground hover:underline"} onClick={() => selectDirectory(path)}>{crumb}</button></span>; })}</nav><p className="mt-2 text-xs text-muted-foreground">{selectedDirectory || "Root"} · {entries.length} 项</p></div>
        <div className="haldur-file-columns hidden grid-cols-[minmax(15rem,1.6fr)_7rem_7rem_minmax(8rem,.8fr)_2.5rem] gap-4 border-b border-border bg-[hsl(var(--surface-subtle)/0.45)] px-6 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground md:grid"><span>名称</span><span>类型</span><span>大小</span><span>更新时间</span><span /></div>
        {entries.length ? <div>{[...entries].sort((left, right) => Number(right.type === "directory") - Number(left.type === "directory") || left.name.localeCompare(right.name, "zh-CN")).map((node) => <div key={node.relativePath} className="haldur-file-row group grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 transition hover:bg-primary/[0.06] md:grid-cols-[minmax(15rem,1.6fr)_7rem_7rem_minmax(8rem,.8fr)_2.5rem] md:gap-4 md:px-6"><button className="flex min-w-0 items-center gap-3 text-left" onClick={(event) => { dialogTrigger.current = event.currentTarget; if (node.type === "directory") selectDirectory(node.relativePath); else void openMarkdown(node); }} disabled={node.type === "file" && !/\.(md|html?|svg|png|jpe?g|webp|gif)$/i.test(node.name)}><span className={`flex h-8 w-8 shrink-0 items-center justify-center border ${node.type === "directory" ? "border-primary/35 bg-primary/15 text-foreground" : "border-border bg-[hsl(var(--surface-subtle))] text-muted-foreground"}`}>{node.type === "directory" ? <Folder size={16} /> : <File size={16} />}</span><span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-sm font-bold">{node.name}</span>{node.relativePath === "SKILL.md" ? <span className="shrink-0 border border-primary/40 bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold">Skill 入口文件</span> : null}</span><span className="mt-1 block text-xs text-muted-foreground md:hidden">{node.type === "directory" ? "文件夹" : formatSize(node.size)} · {formatDate(node.modifiedAt)}</span></span></button><span className="hidden text-xs text-muted-foreground md:block">{node.type === "directory" ? "文件夹" : "文件"}</span><span className="hidden text-xs tabular-nums text-muted-foreground md:block">{node.type === "directory" ? "—" : formatSize(node.size)}</span><time className="hidden text-xs tabular-nums text-muted-foreground md:block">{formatDate(node.modifiedAt)}</time>{canManage || node.type === "file" ? <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`${node.name} 操作`} onFocus={(event) => { dialogTrigger.current = event.currentTarget; }}><MoreHorizontal size={17} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{node.type === "file" ? <DropdownMenuItem onSelect={() => download(node)}><Download size={14} />下载</DropdownMenuItem> : null}{canManage ? <><DropdownMenuItem disabled={readOnly || submitting} onSelect={() => { setValue(node.name); setDialog({ type: "rename", node }); }}><Pencil size={14} />重命名</DropdownMenuItem><DropdownMenuItem disabled={readOnly || submitting} onSelect={() => { setMoveTarget(parentPath(node.relativePath)); setDialog({ type: "move", node }); }}><MoveRight size={14} />移动到…</DropdownMenuItem><DropdownMenuItem disabled={readOnly || submitting} className="text-destructive focus:text-destructive" onSelect={() => setDialog({ type: "delete", node })}><Trash2 size={14} />删除</DropdownMenuItem></> : null}</DropdownMenuContent></DropdownMenu> : null}</div>)}</div> : <div className="flex min-h-72 items-center justify-center px-5 py-12 text-center"><div><Folder className="mx-auto text-muted-foreground" size={28} /><h2 className="mt-4 text-lg font-black">当前文件夹暂无内容</h2><p className="mt-2 text-sm text-muted-foreground">{canManage ? "可上传任意业务文件格式，或新建子文件夹。" : "此目录下暂时没有可浏览的文件。"}</p>{canManage && !readOnly ? <div className="mt-5 flex justify-center gap-2"><Button variant="outline" onClick={(event) => { dialogTrigger.current = event.currentTarget; setUploadOpen(true); }}><Upload size={15} />上传文件</Button><Button onClick={(event) => { dialogTrigger.current = event.currentTarget; setValue(""); setDialog({ type: "create" }); }}><FolderPlus size={15} />新建文件夹</Button></div> : null}</div></div>}</section>}
    </div></div>
    {dialog?.type === "create" || dialog?.type === "rename" ? <AlertDialog onCloseAutoFocus={restoreDialogFocus} label={dialog.type === "create" ? "新建文件夹" : "重命名"} onClose={() => setDialog(null)}><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">{dialog.type === "create" ? "Create directory" : "Rename item"}</p><h2 className="mt-3 text-xl font-black">{dialog.type === "create" ? "新建文件夹" : `重命名 ${dialog.node.name}`}</h2><Input className="mt-5" autoFocus value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void submitDialog()} placeholder="输入名称" /><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(null)}>取消</Button><Button onClick={() => void submitDialog()} disabled={!value.trim() || submitting}>{submitting ? "提交中…" : "确认"}</Button></div></AlertDialog> : null}
    {dialog?.type === "move" ? <AlertDialog onCloseAutoFocus={restoreDialogFocus} label="移动到" onClose={() => setDialog(null)}><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Move item</p><h2 className="mt-3 text-xl font-black">移动 {dialog.node.name}</h2><div className="mt-5 max-h-72 overflow-y-auto border border-border"><label className="flex min-h-10 cursor-pointer items-center gap-2 border-b border-border px-3 text-sm"><input type="radio" checked={!moveTarget} onChange={() => setMoveTarget("")} />Haldur-Design-Skill</label>{directories.map((directory) => { const invalid = dialog.node.type === "directory" && (directory.path === dialog.node.relativePath || directory.path.startsWith(`${dialog.node.relativePath}/`)); return <label key={directory.path} className={`flex min-h-10 items-center gap-2 border-b border-border px-3 text-sm ${invalid ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`} style={{ paddingLeft: `${directory.depth * 16 + 12}px` }}><input type="radio" disabled={invalid} checked={moveTarget === directory.path} onChange={() => setMoveTarget(directory.path)} />{directory.name}</label>; })}</div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(null)}>取消</Button><Button onClick={() => void submitMove()} disabled={submitting}>{submitting ? "移动中…" : "确认移动"}</Button></div></AlertDialog> : null}
    {dialog?.type === "delete" ? <AlertDialog onCloseAutoFocus={restoreDialogFocus} label="确认删除" onClose={() => setDialog(null)}><p className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">Move to runtime trash</p><h2 className="mt-3 text-xl font-black">删除 {dialog.node.name}？</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">该{dialog.node.type === "directory" ? "文件夹及其子内容" : "文件"}将从当前 Skill 中移除并移入运行时回收站，本阶段不提供永久删除。</p><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(null)}>取消</Button><Button variant="destructive" onClick={() => void submitDelete()} disabled={submitting}>{submitting ? "删除中…" : "确认删除"}</Button></div></AlertDialog> : null}

  </main>;
}
