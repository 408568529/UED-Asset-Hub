"use client";
import { useRef, useState } from "react";
import { Alert, Button, Modal, Progress, Radio, Space, Tag } from "antd";
import { droppedFiles, selectedFiles, selectedFolderContents, type UploadSelection } from "@/lib/haldur/uploadSelection";
import { KnowledgeThemeProvider } from "@/components/knowledge/KnowledgeThemeProvider";
import { haldurUploadHeaders } from "@/lib/haldur/uploadHeaders";
import type { HaldurDesignSkillSnapshot } from "@/types/haldurDesignSkill";
import "./haldur-file-tools.css";

type State = "queued" | "uploading" | "success" | "failed" | "skipped" | "unknown";
type Item = { uid: string; file: File; relativePath: string; state: State; choice: "ask" | "skip" | "overwrite"; message?: string };
const labels: Record<State, string> = { queued: "待上传", uploading: "上传中", success: "成功", failed: "失败", skipped: "跳过", unknown: "结果待核对" };
const key = (name: string) => name.normalize("NFC").toLocaleLowerCase("en-US");
export function HaldurUploadQueue({ directory, snapshot, onSnapshot, onClose }: { directory: string; snapshot: HaldurDesignSkillSnapshot; onSnapshot: (snapshot: HaldurDesignSkillSnapshot) => void; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [batchChoice, setBatchChoice] = useState<Item["choice"]>("ask");
  const [message, setMessage] = useState("");
  const running = useRef(false), stop = useRef(false);
  const [target] = useState(directory);
  const fileInput = useRef<HTMLInputElement>(null), folderInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  async function addFiles(selection: Promise<UploadSelection[]> | UploadSelection[]) {
    if (running.current) return;
    setCollecting(true);
    try {
      const files = await selection;
      // A directory incorrectly supplied as a File can fail before fetch starts.
      for (const item of files) await item.file.slice(0, 1).arrayBuffer();
      setItems(rows => [...rows, ...files.map(item => ({ ...item, uid: String(++nextId.current), state: "queued" as const, choice: batchChoice === "overwrite" && existing(item)?.type === "directory" ? "skip" as const : batchChoice }))]);
      setMessage(files.length ? "" : "所选文件夹中没有可上传文件；空目录不会上传。");
    } catch { setMessage("无法读取所选文件或文件夹，请使用选择文件夹重选，不会提交无法读取的项目。"); }
    finally { setCollecting(false); }
  }
  const patch = (uid: string, value: Partial<Item>) => setItems(rows => rows.map(row => row.uid === uid ? { ...row, ...value } : row));
  const existing = (row: Pick<Item, "relativePath">, value = snapshot) => value.manifest.find(entry => key(entry.relativePath) === key([target, row.relativePath].filter(Boolean).join("/")));
  const duplicate = (row: Item) => items.filter(item => key(item.relativePath) === key(row.relativePath)).length > 1;
  function applyBatchChoice(choice: Item["choice"]) {
    setBatchChoice(choice);
    setItems(rows => rows.map(row => row.state === "queued" ? { ...row, choice: choice === "overwrite" && existing(row)?.type === "directory" ? "skip" : choice } : row));
  }
  async function refresh() {
    const response = await fetch("/api/haldur-design-skill", { cache: "no-store" });
    const next = await response.json() as HaldurDesignSkillSnapshot;
    if (!response.ok || !next.rootAvailable || !next.revision) throw new Error("目录不可写或需要恢复，请停止上传并检查。");
    onSnapshot(next);
    if (next.recoveryRequired) throw new Error("目录进入只读恢复状态，队列已停止。");
    return next;
  }
  async function run() {
    if (running.current || collecting) return;
    running.current = true; stop.current = false; setBusy(true); setMessage("");
    let latest = snapshot;
    try {
      latest = await refresh();
      if (latest.revision !== snapshot.revision) { setMessage("目录已发生变化，请重新核对冲突后再提交。"); setBatchChoice("ask"); setItems(rows => rows.map(row => ({ ...row, choice: "ask" }))); return; }
      for (const row of items) {
        if (stop.current) { setMessage("已停止后续上传，未开始的文件没有发送请求。"); break; }
        if (row.state !== "queued") continue;
        if (duplicate(row)) { setMessage("请先移除批次中的等价重名文件。"); break; }
        const conflict = existing(row, latest);
        if (conflict && row.choice === "skip") { patch(row.uid, { state: "skipped", message: "已跳过同名项" }); continue; }
        if (conflict && (row.choice !== "overwrite" || conflict.type !== "file")) { setMessage("请明确选择跳过或覆盖；同名目录不能覆盖。"); break; }
        patch(row.uid, { state: "uploading", message: undefined });
        try {
          const parts = row.relativePath.split("/");
          const name = parts.pop()!;
          let parent = target;
          for (const part of parts) {
            const nextPath = [parent, part].filter(Boolean).join("/");
            const entry = latest.manifest.find(item => key(item.relativePath) === key(nextPath));
            if (entry && entry.type !== "directory") throw new Error("目标路径包含同名文件，请核对目录。");
            if (!entry) {
              const created = await fetch("/api/haldur-design-skill/directories", { method: "POST", headers: { "content-type": "application/json", "if-match": latest.revision! }, body: JSON.stringify({ parentRelativePath: parent, directoryName: part }) });
              const result = await created.json() as { snapshot?: HaldurDesignSkillSnapshot; message?: string };
              if (!created.ok || !result.snapshot?.revision) throw new Error(result.message || "无法创建上传目录，请核对结果。");
              latest = result.snapshot; onSnapshot(latest);
            }
            parent = nextPath;
          }
          const response = await fetch("/api/haldur-design-skill/files", { method: "POST", headers: { ...haldurUploadHeaders(parent, name), "if-match": latest.revision!, "x-haldur-overwrite": String(Boolean(conflict && row.choice === "overwrite")), "content-type": row.file.type || "application/octet-stream" }, body: row.file });
          const result = await response.json() as { snapshot?: HaldurDesignSkillSnapshot; code?: string; message?: string };
          if (!response.ok || !result.snapshot?.revision) {
            const global = ["REVISION_CONFLICT", "RECOVERY_REQUIRED", "ROLLBACK_FAILED", "PERMISSION_DENIED", "TARGET_NOT_FOUND", "ROOT_UNAVAILABLE", "DISK_SPACE_INSUFFICIENT", "NAME_CONFLICT"].includes(result.code ?? "");
            // A server error can follow a committed write (e.g. response lost during cleanup).
            const uncertain = response.ok || response.status >= 500 && !["REPLACE_FAILED", "FILE_TOO_LARGE", "DISK_SPACE_INSUFFICIENT"].includes(result.code ?? "");
            patch(row.uid, { state: uncertain ? "unknown" : "failed", message: result.message ?? "上传未完成" });
            if (global || uncertain) { setMessage("队列已暂停；请核对目录、权限及逐项结果后再操作。"); break; }
            continue;
          }
          latest = result.snapshot; onSnapshot(latest); patch(row.uid, { state: "success", message: "已保存" });
        } catch { patch(row.uid, { state: "unknown", message: "请求结果未知，不会自动重试。请核对目标内容。" }); setMessage("网络或响应异常，队列已暂停。"); break; }
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法确认目录状态。"); }
    finally {
      try { await refresh(); } catch { /* Keep results; do not infer failure/success from a refresh error. */ }
      running.current = false; setBusy(false);
    }
  }
  async function reconcile(row: Item) {
    setMessage("");
    try {
      const latest = await refresh(), entry = existing(row, latest);
      if (row.file.size > 16 * 1024 * 1024) { patch(row.uid, { message: "文件超过本地核对预算，请下载目标后人工核对；不会自动重试。" }); return; }
      // LAN HTTP has no crypto.subtle. Compare the actual downloaded bytes;
      // this reconciliation only reads and never retries an uncertain write.
      let matches = false;
      if (entry?.type === "file" && entry.size === row.file.size) {
        const response = await fetch("/api/haldur-design-skill/files?path=" + encodeURIComponent(entry.relativePath), { cache: "no-store" });
        if (!response.ok || Number(response.headers.get("content-length")) !== row.file.size) throw new Error("无法确认目标文件大小。");
        const [actual, expected] = await Promise.all([response.arrayBuffer(), row.file.arrayBuffer()]);
        const bytes = new Uint8Array(expected), downloaded = new Uint8Array(actual);
        matches = downloaded.length === bytes.length && bytes.every((value, index) => value === downloaded[index]);
      }
      if (matches) patch(row.uid, { state: "success", message: "核对通过：目标字节与所选文件一致" });
      else patch(row.uid, { message: "尚不能确认写入结果。请刷新目录人工核对；不会自动重试。" });
    } catch { setMessage("核对未完成，请稍后重试核对。"); }
  }
  const finished = items.filter(item => ["success", "failed", "skipped", "unknown"].includes(item.state)).length;
  const queued = items.filter(item => item.state === "queued");
  const blocked = queued.some(row => duplicate(row) || (existing(row) && row.choice === "ask"));
  return <KnowledgeThemeProvider><Modal open transitionName="" maskTransitionName="" title="批量上传文件" rootClassName="haldur-file-modal" width={760} onCancel={() => { if (busy) { stop.current = true; setMessage("将在当前文件完成后停止，结果将保留。"); } else onClose(); }} footer={<Space wrap><Button onClick={() => { stop.current = true; }} disabled={!busy}>停止后续上传</Button><Button onClick={onClose} disabled={busy || collecting}>关闭</Button><Button type="primary" onClick={() => void run()} disabled={busy || collecting || !queued.length || blocked || snapshot.recoveryRequired}>{busy ? "上传中…" : `上传 ${queued.length} 个文件`}</Button></Space>}>
    <p className="haldur-upload-target">目标目录：Haldur-Design-Skill{target ? ` / ${target}` : ""}（本批次固定）</p>
    <div className="border border-dashed border-border p-5 text-center" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && !collecting) void addFiles(droppedFiles(event.dataTransfer)); }}>
      <input ref={fileInput} type="file" multiple hidden disabled={busy || collecting} onChange={event => { if (event.target.files) void addFiles(Promise.resolve(Array.from(event.target.files)).then(selectedFiles)); event.target.value = ""; }} />
      <input ref={folderInput} type="file" multiple hidden disabled={busy || collecting} {...{ webkitdirectory: "" }} onChange={event => { if (event.target.files) void addFiles(Promise.resolve(Array.from(event.target.files)).then(selectedFolderContents)); event.target.value = ""; }} />
      <Space><Button disabled={busy || collecting} onClick={() => fileInput.current?.click()}>选择文件</Button><Button disabled={busy || collecting} onClick={() => folderInput.current?.click()}>选择文件夹内容</Button></Space>
      <p>选择文件夹内容：将其中的文件和子文件夹直接放入目标目录，不额外套一层所选文件夹。</p>
      <p>也可在本地文件夹内全选文件和文件夹，一起拖入此处；保留所拖入子文件夹的层级。空目录和 .DS_Store 不上传。</p>
      <p>选择后统一提交；同名文件须明确跳过或覆盖。</p>
    </div>
    {message ? <Alert style={{ marginTop: 16 }} type="warning" title={message} showIcon /> : null}
    {items.length ? <><div className="haldur-upload-policy"><span>同名项统一处理</span><Radio.Group aria-label="同名项统一处理" disabled={busy || collecting} value={batchChoice} onChange={event => applyBatchChoice(event.target.value)} optionType="button" options={[{ value: "ask", label: "暂不处理" }, { value: "skip", label: "全部跳过" }, { value: "overwrite", label: "覆盖同名文件" }]} /><p>应用于当前待上传项及后续添加的文件，可在下方逐项调整。统一选择覆盖时，同名目录会跳过，不会被文件覆盖。</p></div><Progress strokeColor="var(--ant-color-primary)" percent={Math.round(finished / items.length * 100)} format={() => `${finished} / ${items.length} 项已处理`} /><div className="haldur-upload-results" aria-label="逐项上传结果">{items.map(row => <div className="haldur-upload-row" key={row.uid} data-upload-state={row.state}><div><div className="haldur-upload-row-name">{row.relativePath} <Tag color={row.state === "success" ? "success" : row.state === "failed" ? "error" : "default"}>{labels[row.state]}</Tag></div><div className="haldur-upload-row-message">{row.file.size.toLocaleString()} B · {duplicate(row) ? "批内等价重名，请移除重复项" : row.message ?? (existing(row) ? "存在同名项，请选择处理方式" : "待提交")}</div></div><Space wrap>{row.state === "queued" && existing(row) ? <Radio.Group aria-label={`${row.relativePath} 冲突处理`} disabled={busy || collecting} value={row.choice} optionType="button" size="small" options={[{ value: "ask", label: "待选" }, { value: "skip", label: "跳过" }, ...(existing(row)?.type === "file" ? [{ value: "overwrite", label: "覆盖" }] : [])]} onChange={event => patch(row.uid, { choice: event.target.value })} /> : null}{row.state === "failed" ? <Button size="small" disabled={busy || collecting} onClick={() => patch(row.uid, { state: "queued", choice: "ask", message: undefined })}>重新准备</Button> : null}{row.state === "unknown" ? <Button size="small" disabled={busy || collecting} onClick={() => void reconcile(row)}>核对结果</Button> : null}{row.state === "queued" ? <Button size="small" disabled={busy || collecting} onClick={() => setItems(rows => rows.filter(item => item.uid !== row.uid))}>移除</Button> : null}</Space></div>)}</div></> : null}
  </Modal></KnowledgeThemeProvider>;
}
