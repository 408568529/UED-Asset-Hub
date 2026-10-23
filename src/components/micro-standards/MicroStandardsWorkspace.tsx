"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Select } from "antd";
import { Folder, Plus } from "lucide-react";
import { isAdminLoggedIn } from "@/lib/adminSession";
import { markdownKnowledgeSpecTopics, type MarkdownKnowledgeMetadata } from "@/types/markdownKnowledge";
import { AssetRow, KnowledgeListHeader, KnowledgeWorkspaceShell } from "@/components/knowledge/KnowledgeLibraryWorkspace";
import { WorkspaceRowActions } from "@/components/layout/WorkspaceRowActions";
import { adaptMarkdownKnowledge } from "@/services/markdownKnowledgeAdapter";
const label = (t: string) => markdownKnowledgeSpecTopics.find(v => v.value === t)?.label ?? t;
export function MicroStandardsWorkspace({ topics, documents, topic, children, detail = false }: { topics: string[]; documents: MarkdownKnowledgeMetadata[]; topic?: string; children?: React.ReactNode; detail?: boolean }) {
  const router = useRouter();
  const [admin, setAdmin] = useState(false), [q, setQ] = useState("");
  const [operation, setOperation] = useState<{ action: "create" | "rename" | "delete"; name: string }>();
  const [name, setName] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { void isAdminLoggedIn().then(setAdmin); }, []);
  const filtered = documents.filter(d => (!topic || d.specTopic === topic) && [d.title, d.description, ...d.tags].join(" ").toLowerCase().includes(q.toLowerCase()));
  async function apply() {
    if (!operation) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/micro-standards/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: operation.action, name: operation.action === "create" ? name : operation.name, next: operation.action === "rename" ? name : undefined }) });
      const value = await r.json(); if (!r.ok) throw Error(value.message);
      setOperation(undefined); router.push("/micro-standards"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "操作失败。"); } finally { setBusy(false); }
  }
  return <KnowledgeWorkspaceShell mode="browse" detail={detail} sidebar={
    <aside className="knowledge-workspace-sidebar micro-topics w-full shrink-0 border-b border-border px-3 py-3 lg:w-60 lg:border-b-0 lg:border-r lg:px-4 lg:py-5"><div className="mb-3 px-2"><h2 className="text-sm font-black">微规范</h2><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{documents.length} 项规范 · 独立资产库</p></div>
      <Link className={`micro-topic ${!topic ? "is-selected" : ""}`} href="/micro-standards"><Folder size={16}/>全部主题</Link>
      {topics.map(t => <div key={t} className={`workspace-folder-row micro-topic-row ${topic === t ? "is-selected" : ""}`}><Link className="micro-topic" href={`/micro-standards?topic=${encodeURIComponent(t)}`}><Folder size={16}/><span className="truncate">{label(t)}</span></Link>{admin ? <WorkspaceRowActions name={label(t)} onRename={() => { setOperation({ action: "rename", name: t }); setName(t); setError(""); }} onDelete={() => { setOperation({ action: "delete", name: t }); setError(""); }}/> : null}</div>)}
      {admin ? <Button type="text" className="mt-3" icon={<Plus size={15}/>} onClick={() => { setOperation({ action: "create", name: "" }); setName(""); setError(""); }}>新建主题</Button> : null}
    </aside>}><div className="micro-main">{children || <><header className="knowledge-list-header"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="knowledge-list-heading text-xl font-bold">{topic ? label(topic) : "全部微规范"}</h1><p className="mt-1 text-sm text-muted-foreground">{filtered.length} 项规范</p></div>{admin ? <Button type="primary" href="/micro-standards?edit=new" icon={<Plus size={16}/>}>新建微规范</Button> : null}</div>
      <div className="mt-5 flex flex-wrap gap-3"><Input.Search className="max-w-md" allowClear placeholder="搜索规范标题、简介或标签" aria-label="搜索微规范" value={q} onChange={e => setQ(e.target.value)}/><Select aria-label="规范主题筛选" className="min-w-40" value={topic || ""} options={[{ value: "", label: "全部主题" }, ...topics.map(t => ({ value: t, label: label(t) }))]} onChange={t => router.push(t ? `/micro-standards?topic=${encodeURIComponent(t)}` : "/micro-standards")}/></div></header>
      <KnowledgeListHeader/><div className="library-list">{filtered.map(d => <AssetRow key={d.id} item={adaptMarkdownKnowledge(d)} query={{}}/>)}{!filtered.length ? <p className="py-10 text-sm text-muted-foreground">暂无微规范。{admin ? "请先新建主题，再创建或上传 Markdown。" : ""}</p> : null}</div></>}
    </div>
    <Modal open={Boolean(operation)} title={operation?.action === "delete" ? "删除空主题" : operation?.action === "rename" ? "重命名主题" : "新建主题"} onCancel={() => setOperation(undefined)} onOk={() => void apply()} confirmLoading={busy} destroyOnHidden okText="确认" cancelText="取消">
      {operation?.action === "delete" ? <p>仅允许删除空文件夹；非空主题不会被删除。</p> : <Input aria-label="主题名称" value={name} onChange={e => setName(e.target.value)} autoFocus/>}{error ? <p role="alert" className="mt-3 text-destructive">{error}</p> : null}
    </Modal>
  </KnowledgeWorkspaceShell>;
}
