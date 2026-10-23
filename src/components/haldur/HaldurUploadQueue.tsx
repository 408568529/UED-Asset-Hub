"use client";
import { useRef, useState } from "react";
import { Alert, Button, Modal, Progress, Select, Space, Tag, Upload } from "antd";
import type { RcFile } from "antd/es/upload";
import { KnowledgeThemeProvider } from "@/components/knowledge/KnowledgeThemeProvider";
import { haldurUploadHeaders } from "@/lib/haldur/uploadHeaders";
import type { HaldurDesignSkillSnapshot } from "@/types/haldurDesignSkill";
import "./haldur-file-tools.css";

type State = "queued" | "uploading" | "success" | "failed" | "skipped" | "unknown";
type Item = { uid: string; file: RcFile; state: State; choice: "ask" | "skip" | "overwrite"; message?: string };
const labels: Record<State, string> = { queued: "待上传", uploading: "上传中", success: "成功", failed: "失败", skipped: "跳过", unknown: "结果待核对" };
const key = (name: string) => name.normalize("NFC").toLocaleLowerCase("en-US");
export function HaldurUploadQueue({ directory, snapshot, onSnapshot, onClose }: { directory: string; snapshot: HaldurDesignSkillSnapshot; onSnapshot: (snapshot: HaldurDesignSkillSnapshot) => void; onClose: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const running = useRef(false), stop = useRef(false);
  const [target] = useState(directory);
  const patch = (uid: string, value: Partial<Item>) => setItems(rows => rows.map(row => row.uid === uid ? { ...row, ...value } : row));
  const existing = (file: File, value = snapshot) => value.manifest.find(entry => key(entry.relativePath) === key([target, file.name].filter(Boolean).join("/")));
  const duplicate = (row: Item) => items.filter(item => key(item.file.name) === key(row.file.name)).length > 1;
  async function refresh() {
    const response = await fetch("/api/haldur-design-skill", { cache: "no-store" });
    const next = await response.json() as HaldurDesignSkillSnapshot;
    if (!response.ok || !next.rootAvailable || !next.revision) throw new Error("目录不可写或需要恢复，请停止上传并检查。");
    onSnapshot(next);
    if (next.recoveryRequired) throw new Error("目录进入只读恢复状态，队列已停止。");
    return next;
  }
  async function run() {
    if (running.current) return;
    running.current = true; stop.current = false; setBusy(true); setMessage("");
    let latest = snapshot;
    try {
      latest = await refresh();
      if (latest.revision !== snapshot.revision) { setMessage("目录已发生变化，请重新核对冲突后再提交。"); setItems(rows => rows.map(row => ({ ...row, choice: "ask" }))); return; }
      for (const row of items) {
        if (stop.current) { setMessage("已停止后续上传，未开始的文件没有发送请求。"); break; }
        if (row.state !== "queued") continue;
        if (duplicate(row)) { setMessage("请先移除批次中的等价重名文件。"); break; }
        const conflict = existing(row.file, latest);
        if (conflict && row.choice === "skip") { patch(row.uid, { state: "skipped", message: "已跳过同名项" }); continue; }
        if (conflict && (row.choice !== "overwrite" || conflict.type !== "file")) { setMessage("请明确选择跳过或覆盖；同名目录不能覆盖。"); break; }
        patch(row.uid, { state: "uploading", message: undefined });
        try {
          const response = await fetch("/api/haldur-design-skill/files", { method: "POST", headers: { ...haldurUploadHeaders(target, row.file.name), "if-match": latest.revision!, "x-haldur-overwrite": String(Boolean(conflict && row.choice === "overwrite")), "content-type": row.file.type || "application/octet-stream" }, body: row.file });
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
      const latest = await refresh(), entry = existing(row.file, latest);
      if (row.file.size > 16 * 1024 * 1024) { patch(row.uid, { message: "文件超过本地核对预算，请下载目标后人工核对；不会自动重试。" }); return; }
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await row.file.arrayBuffer()))].map(value => value.toString(16).padStart(2, "0")).join("");
      if (entry?.checksum === digest && entry.size === row.file.size) patch(row.uid, { state: "success", message: "核对通过：目标字节与所选文件一致" });
      else patch(row.uid, { message: "尚不能确认写入结果。请刷新目录人工核对；不会自动重试。" });
    } catch { setMessage("核对未完成，请稍后重试核对。"); }
  }
  const finished = items.filter(item => ["success", "failed", "skipped", "unknown"].includes(item.state)).length;
  const queued = items.filter(item => item.state === "queued");
  const blocked = queued.some(row => duplicate(row) || (existing(row.file) && row.choice === "ask"));
  return <KnowledgeThemeProvider><Modal open transitionName="" maskTransitionName="" title="批量上传文件" rootClassName="haldur-file-modal" width={760} onCancel={() => { if (busy) { stop.current = true; setMessage("将在当前文件完成后停止，结果将保留。"); } else onClose(); }} footer={<Space wrap><Button onClick={() => { stop.current = true; }} disabled={!busy}>停止后续上传</Button><Button onClick={onClose} disabled={busy}>关闭</Button><Button type="primary" onClick={() => void run()} disabled={busy || !queued.length || blocked || snapshot.recoveryRequired}>{busy ? "上传中…" : `上传 ${queued.length} 个文件`}</Button></Space>}>
    <p className="haldur-upload-target">目标目录：Haldur-Design-Skill{target ? ` / ${target}` : ""}（本批次固定）</p>
    <Upload.Dragger multiple disabled={busy} fileList={items.map(row => ({ uid: row.uid, name: row.file.name, originFileObj: row.file }))} showUploadList={false} beforeUpload={file => { setItems(rows => rows.some(row => row.uid === file.uid) ? rows : [...rows, { uid: file.uid, file, state: "queued", choice: "ask" }]); return false; }}><p>点击选择或拖入多个文件</p><p className="ant-upload-hint">保留原文件名；选择后统一提交，不会自动覆盖。</p></Upload.Dragger>
    {message ? <Alert style={{ marginTop: 16 }} type="warning" title={message} showIcon /> : null}
    {items.length ? <><Progress strokeColor="var(--ant-color-primary)" percent={Math.round(finished / items.length * 100)} format={() => `${finished} / ${items.length} 项已处理`} /><div className="haldur-upload-results" aria-label="逐项上传结果">{items.map(row => <div className="haldur-upload-row" key={row.uid} data-upload-state={row.state}><div><div className="haldur-upload-row-name">{row.file.name} <Tag color={row.state === "success" ? "success" : row.state === "failed" ? "error" : "default"}>{labels[row.state]}</Tag></div><div className="haldur-upload-row-message">{row.file.size.toLocaleString()} B · {duplicate(row) ? "批内等价重名，请移除重复项" : row.message ?? (existing(row.file) ? "存在同名项，请选择处理方式" : "待提交")}</div></div><Space wrap>{row.state === "queued" && existing(row.file) ? <Select getPopupContainer={trigger => trigger.closest(".ant-modal") as HTMLElement} aria-label={`${row.file.name} 冲突处理`} disabled={busy} value={row.choice} style={{ width: 130 }} options={[{ value: "ask", label: "选择处理" }, { value: "skip", label: "跳过" }, ...(existing(row.file)?.type === "file" ? [{ value: "overwrite", label: "覆盖" }] : [])]} onChange={choice => patch(row.uid, { choice })} /> : null}{row.state === "failed" ? <Button size="small" disabled={busy} onClick={() => patch(row.uid, { state: "queued", choice: "ask", message: undefined })}>重新准备</Button> : null}{row.state === "unknown" ? <Button size="small" disabled={busy} onClick={() => void reconcile(row)}>核对结果</Button> : null}{row.state === "queued" ? <Button size="small" disabled={busy} onClick={() => setItems(rows => rows.filter(item => item.uid !== row.uid))}>移除</Button> : null}</Space></div>)}</div></> : null}
  </Modal></KnowledgeThemeProvider>;
}
