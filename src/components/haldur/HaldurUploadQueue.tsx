"use client";
import { useRef, useState } from "react";
import { Alert, Button, Modal, Progress, Radio, Space, Tag } from "antd";
import { droppedFiles, selectedFiles, selectedFolderContents, type UploadSelection } from "@/lib/haldur/uploadSelection";
import { KnowledgeThemeProvider } from "@/components/knowledge/KnowledgeThemeProvider";
import { haldurUploadHeaders } from "@/lib/haldur/uploadHeaders";
import type { HaldurDesignSkillSnapshot } from "@/types/haldurDesignSkill";
import "./haldur-file-tools.css";

type State = "queued" | "uploading" | "success" | "failed" | "skipped" | "unknown" | "staged";
type Item = { uid: string; file: File; relativePath: string; state: State; choice: "ask" | "skip" | "overwrite"; message?: string };
const labels: Record<State, string> = { staged: "已暂存", queued: "待上传", uploading: "上传中", success: "成功", failed: "失败", skipped: "跳过", unknown: "结果待核对" };
const key = (name: string) => name.normalize("NFC").toLocaleLowerCase("en-US");
export function HaldurUploadQueue({ directory, snapshot, onSnapshot, onClose }: { directory: string; snapshot: HaldurDesignSkillSnapshot; onSnapshot: (snapshot: HaldurDesignSkillSnapshot) => void; onClose: () => void }) {
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [selectedDirectories, setSelectedDirectories] = useState<string[]>([]);
  const [replaceId, setReplaceId] = useState("");
  const [replaceCommitting, setReplaceCommitting] = useState(false);
  const [plan, setPlan] = useState<{ id: string; revision: string; files: number; directories: number; removed: string[]; updated: string[]; added: string[]; rows: Item[] } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [batchChoice, setBatchChoice] = useState<Item["choice"]>("ask");
  const [message, setMessage] = useState("");
  const running = useRef(false), stop = useRef(false);
  const [target] = useState(directory);
  const fileInput = useRef<HTMLInputElement>(null), folderInput = useRef<HTMLInputElement>(null);
  const nextId = useRef(0);
  async function addFiles(selection: Promise<UploadSelection[]> | UploadSelection[], directoryPaths: string[] = []) {
    if (running.current) return;
    setCollecting(true);
    try {
      const files = await selection;
      // A directory incorrectly supplied as a File can fail before fetch starts.
      for (const item of files) await item.file.slice(0, 1).arrayBuffer();
      setItems(rows => [...rows, ...files.map(item => ({ ...item, uid: String(++nextId.current), state: "queued" as const, choice: batchChoice === "overwrite" && existing(item)?.type === "directory" ? "skip" as const : batchChoice }))]);
      setSelectedDirectories(rows => [...new Set([...rows, ...directoryPaths])]);
      setMessage(files.length || directoryPaths.length ? "" : "所选文件夹中没有可上传文件；空目录不会上传。");
    } catch { setMessage("无法读取所选文件或文件夹，请使用选择文件夹重选，不会提交无法读取的项目。"); }
    finally { setCollecting(false); }
  }
  const patch = (uid: string, value: Partial<Item>) => setItems(rows => rows.map(row => row.uid === uid ? { ...row, ...value } : row));
  const existing = (row: Pick<Item, "relativePath">, value = snapshot) => value.manifest.find(entry => key(entry.relativePath) === key([mode === "replace" ? "" : target, row.relativePath].filter(Boolean).join("/")));
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
  async function prepareReplacement() {
    if (running.current || collecting) return;
    setBusy(true); setMessage("");
    try {
      const latest = await refresh();
      if (latest.revision !== snapshot.revision) throw new Error("目录已发生变化，请核对后再次提交。");
      const response = await fetch("/api/haldur-design-skill/replace", { method: "POST", headers: { "content-type": "application/json", "if-match": latest.revision! }, body: JSON.stringify({ action: "prepare", files: items.map(row => ({ relativePath: row.relativePath, size: row.file.size })), directories: selectedDirectories }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "无法准备整批覆盖。");
      setPlan({ ...result, revision: latest.revision!, rows: items });
    } catch (error) { setMessage(error instanceof Error ? error.message : "无法准备整批覆盖。"); }
    finally { setBusy(false); }
  }
  async function checkReplacement(id = replaceId) {
    try {
      const response = await fetch("/api/haldur-design-skill/replace?id=" + encodeURIComponent(id), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      if (result.status === "committed") { await refresh(); setItems(rows => rows.map(row => ({ ...row, state: "success", message: "整批提交已核对" }))); setReplaceId(""); setMessage("完整覆盖已完成；旧版内容已移入统一回收位置。"); }
      else if (["staging", "rolled-back"].includes(result.status)) { await refresh(); setItems(rows => rows.map(row => ({ ...row, state: "queued", message: undefined }))); setReplaceId(""); setMessage(result.status === "rolled-back" ? "整批已回滚，原Skill已恢复。请重新核对后上传。" : "批次尚未提交，原Skill未改变。请重新核对后上传。"); }
      else setMessage("整批结果尚未确认；如进入恢复状态，请先恢复，不会自动重试。");
    } catch { setMessage("暂时无法核对整批结果，请稍后核对；不会自动重试。"); }
  }
  async function applyReplacement() {
    if (!plan || running.current) return;
    const batch = plan; setPlan(null); running.current = true; stop.current = false; setBusy(true); setReplaceId(batch.id); setMessage("正在暂存整批文件，原Skill尚未改变。");
    let commitRequested = false;
    try {
      for (let index = 0; index < batch.rows.length; index++) {
        if (stop.current) throw new Error("已停止暂存，原Skill未改变。");
        const row = batch.rows[index]; patch(row.uid, { state: "uploading" });
        const response = await fetch(`/api/haldur-design-skill/replace?id=${encodeURIComponent(batch.id)}&index=${index}`, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: row.file });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "文件暂存失败，原Skill未改变。");
        patch(row.uid, { state: "staged", message: "等待整批提交，尚未更新Skill" });
      }
      if (stop.current) throw new Error("已停止，原Skill未改变。");
      setReplaceCommitting(true); setMessage("正在提交整批内容，请等待完成。"); commitRequested = true;
      const response = await fetch("/api/haldur-design-skill/replace", { method: "POST", headers: { "content-type": "application/json", "if-match": batch.revision }, body: JSON.stringify({ action: "commit", id: batch.id }) });
      const result = await response.json();
      if (!response.ok || !result.snapshot?.revision) throw new Error(result.message || "整批提交结果需要核对。");
      onSnapshot(result.snapshot); setItems(rows => rows.map(row => ({ ...row, state: "success", message: "完整覆盖已生效" }))); setReplaceId(""); setMessage("完整覆盖已完成；旧版内容已移入统一回收位置。");
    } catch (error) {
      if (commitRequested) { setItems(rows => rows.map(row => ({ ...row, state: "unknown", message: "请使用整批结果核对" }))); await checkReplacement(batch.id); }
      else { setItems(rows => rows.map(row => ({ ...row, state: "queued", message: undefined }))); setReplaceId(""); setMessage("暂存未完成，原Skill未改变。" + (error instanceof Error ? error.message : "")); }
    } finally { running.current = false; setBusy(false); setReplaceCommitting(false); }
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
  const finished = items.filter(item => ["success", "failed", "skipped", "unknown", "staged"].includes(item.state)).length;
  const queued = items.filter(item => item.state === "queued");
  const blocked = queued.some(row => duplicate(row) || (mode === "merge" && existing(row) && row.choice === "ask"));
  return <KnowledgeThemeProvider><Modal open transitionName="" maskTransitionName="" title="批量上传文件" rootClassName="haldur-file-modal" width={760} onCancel={() => { if (busy) { if (!replaceCommitting) stop.current = true; setMessage(replaceCommitting ? "整批正在提交，暂不能中断；请等待核对结果。" : "将在当前文件完成后停止，结果将保留。"); } else onClose(); }} footer={<Space wrap><Button onClick={() => { stop.current = true; }} disabled={!busy || replaceCommitting}>停止后续上传</Button><Button onClick={onClose} disabled={busy || collecting}>关闭</Button><Button type="primary" onClick={() => void (mode === "replace" ? prepareReplacement() : run())} disabled={busy || collecting || (mode === "replace" ? !items.length && !selectedDirectories.length || Boolean(replaceId) : !queued.length) || blocked || snapshot.recoveryRequired}>{busy ? "处理中…" : mode === "replace" ? "完整覆盖整个Skill…" : `上传 ${queued.length} 个文件`}</Button></Space>}>
    <p className="haldur-upload-target">目标目录：Haldur-Design-Skill{mode === "merge" && target ? ` / ${target}` : ""}（本批次固定）</p>
    <div className="haldur-upload-policy"><span>上传方式</span><Radio.Group aria-label="上传方式" disabled={busy || collecting} value={mode} optionType="button" options={[{ value: "merge", label: "增量上传" }, { value: "replace", label: "完整覆盖整个Skill" }]} onChange={event => { setMode(event.target.value); setItems(rows => rows.map(row => ({ ...row, state: "queued", message: undefined }))); setReplaceId(""); setMessage(""); }} /></div>
    {mode === "replace" ? <Alert type="warning" showIcon title="本次选择即最终Skill全部内容，未选择的旧文件和目录将移入回收位置。忽略当前子目录及逐文件跳过/覆盖设置，整批暂存成功后才提交。空文件夹请通过拖拽上传。" /> : null}
    {replaceId && !busy ? <Button onClick={() => void checkReplacement()}>核对整批结果</Button> : null}
    <div className="border border-dashed border-border p-5 text-center" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && !collecting) { const dirs: string[] = []; void addFiles(droppedFiles(event.dataTransfer, dirs), dirs); } }}>
      <input ref={fileInput} type="file" multiple hidden disabled={busy || collecting} onChange={event => { if (event.target.files) void addFiles(Promise.resolve(Array.from(event.target.files)).then(selectedFiles)); event.target.value = ""; }} />
      <input ref={folderInput} type="file" multiple hidden disabled={busy || collecting} {...{ webkitdirectory: "" }} onChange={event => { if (event.target.files) void addFiles(Promise.resolve(Array.from(event.target.files)).then(selectedFolderContents)); event.target.value = ""; }} />
      <Space><Button disabled={busy || collecting} onClick={() => fileInput.current?.click()}>选择文件</Button><Button disabled={busy || collecting} onClick={() => folderInput.current?.click()}>选择文件夹内容</Button></Space>
      <p>选择文件夹内容：将其中的文件和子文件夹直接放入目标目录，不额外套一层所选文件夹。</p>
      <p>直接拖入一个文件夹：上传其中内容，不保留最外层文件夹；混合拖入多个文件和文件夹时保留各子文件夹层级。{mode === "replace" ? "完整覆盖保留拖入的空目录；.DS_Store 不上传。" : "空目录和 .DS_Store 不上传。"}</p>
      <p>{mode === "replace" ? "整批暂存后一次提交；逐文件跳过/覆盖选项不生效。" : "选择后统一提交；同名文件须明确跳过或覆盖。"}</p>
    </div>
    {message ? <Alert style={{ marginTop: 16 }} type="warning" title={message} showIcon /> : null}
    {items.length || selectedDirectories.length ? <>{mode === "merge" ? <div className="haldur-upload-policy"><span>同名项统一处理</span><Radio.Group aria-label="同名项统一处理" disabled={busy || collecting} value={batchChoice} onChange={event => applyBatchChoice(event.target.value)} optionType="button" options={[{ value: "ask", label: "暂不处理" }, { value: "skip", label: "全部跳过" }, { value: "overwrite", label: "覆盖同名文件" }]} /><p>应用于当前待上传项及后续添加的文件，可在下方逐项调整。统一选择覆盖时，同名目录会跳过，不会被文件覆盖。</p></div> : <p>已选择 {items.length} 个文件、{selectedDirectories.length} 个显式目录（包含子目录）。</p>}<Button disabled={busy || collecting} onClick={() => { setItems([]); setSelectedDirectories([]); setReplaceId(""); }}>清空选择</Button><Progress strokeColor="var(--ant-color-primary)" percent={items.length ? Math.round(finished / items.length * 100) : 0} format={() => `${finished} / ${items.length} 项已处理`} /><div className="haldur-upload-results" aria-label="逐项上传结果">{items.map(row => <div className="haldur-upload-row" key={row.uid} data-upload-state={row.state}><div><div className="haldur-upload-row-name">{row.relativePath} <Tag color={row.state === "success" ? "success" : row.state === "failed" ? "error" : "default"}>{labels[row.state]}</Tag></div><div className="haldur-upload-row-message">{row.file.size.toLocaleString()} B · {duplicate(row) ? "批内等价重名，请移除重复项" : row.message ?? (existing(row) ? "存在同名项，请选择处理方式" : "待提交")}</div></div><Space wrap>{mode === "merge" && row.state === "queued" && existing(row) ? <Radio.Group aria-label={`${row.relativePath} 冲突处理`} disabled={busy || collecting} value={row.choice} optionType="button" size="small" options={[{ value: "ask", label: "待选" }, { value: "skip", label: "跳过" }, ...(existing(row)?.type === "file" ? [{ value: "overwrite", label: "覆盖" }] : [])]} onChange={event => patch(row.uid, { choice: event.target.value })} /> : null}{row.state === "failed" ? <Button size="small" disabled={busy || collecting} onClick={() => patch(row.uid, { state: "queued", choice: "ask", message: undefined })}>重新准备</Button> : null}{mode === "merge" && row.state === "unknown" ? <Button size="small" disabled={busy || collecting} onClick={() => void reconcile(row)}>核对结果</Button> : null}{row.state === "queued" ? <Button size="small" disabled={busy || collecting} onClick={() => setItems(rows => rows.filter(item => item.uid !== row.uid))}>移除</Button> : null}</Space></div>)}</div></> : null}
  </Modal><Modal open={Boolean(plan)} title="确认完整覆盖整个Skill" onCancel={() => setPlan(null)} onOk={() => void applyReplacement()} okText="确认整批覆盖" cancelText="返回核对" rootClassName="haldur-file-modal">
    <Alert type="warning" showIcon title="提交后整个Skill只保留本批次内容，所有旧内容会留存在统一回收位置。" />
    <p>最终：{plan?.files} 个文件、{plan?.directories} 个目录。新增 {plan?.added.length} 项，更新 {plan?.updated.length} 项，移出 {plan?.removed.length} 项。</p>
    <div style={{ maxHeight: "40vh", overflow: "auto" }}>{([ ["新增", plan?.added], ["更新", plan?.updated], ["移出", plan?.removed] ] as const).map(([label, paths]) => <div key={label}><strong>{label}</strong>{paths?.map(path => <div key={path} style={{ overflowWrap: "anywhere" }}>{path}</div>)}</div>)}</div>
  </Modal></KnowledgeThemeProvider>;
}
