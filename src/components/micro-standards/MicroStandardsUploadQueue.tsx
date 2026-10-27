"use client";

import { useRef, useState } from "react";
import { Alert, Button, Modal, Progress, Select, Space, Tag, Upload } from "antd";
import type { RcFile } from "antd/es/upload";
import { markdownKnowledgeRelatedScopes, markdownKnowledgeSpecTopics } from "@/types/markdownKnowledge";
import type { MarkdownKnowledgeRelatedScope } from "@/types/markdownKnowledge";
import "@/components/haldur/haldur-file-tools.css";

type Item = { file: RcFile; state: "queued" | "uploading" | "success" | "failed" | "unknown"; message?: string };
const labels = { queued: "待上传", uploading: "上传中", success: "成功", failed: "失败", unknown: "结果待核对" };

export function MicroStandardsUploadQueue({ topics, initialTopic, onRefresh, onClose }: {
  topics: string[]; initialTopic?: string; onRefresh: () => void; onClose: () => void;
}) {
  const [topic, setTopic] = useState(initialTopic);
  const [scopes, setScopes] = useState<MarkdownKnowledgeRelatedScope[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const running = useRef(false), stop = useRef(false);
  const patch = (uid: string, value: Partial<Item>) => setItems(rows => rows.map(row => row.file.uid === uid ? { ...row, ...value } : row));
  async function run() {
    if (running.current || !topic || !scopes.length) return;
    setLocked(true); running.current = true; stop.current = false; setBusy(true); setMessage("");
    try {
      for (const row of items) {
        if (stop.current) break;
        if (row.state !== "queued") continue;
        patch(row.file.uid, { state: "uploading" });
        let content: string;
        try { content = await row.file.text(); }
        catch { patch(row.file.uid, { state: "failed", message: "无法读取本地文件，未发送上传请求。" }); continue; }
        try {
          const response = await fetch("/api/micro-standards", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceFileName: row.file.name, title: row.file.name.replace(/\.md$/i, ""), specTopic: topic, relatedScopes: scopes, content })
          });
          const result = await response.json();
          if (response.status >= 500 || response.ok && !result.metadata?.id) throw Error("上传结果待核对");
          patch(row.file.uid, response.ok ? { state: "success", message: "已保存" } : { state: "failed", message: result.message ?? "上传失败" });
          if ([401, 403].includes(response.status)) { setMessage("登录状态或权限发生变化，已停止后续上传。"); break; }
        } catch {
          patch(row.file.uid, { state: "unknown", message: "请求结果未知，不会自动重试；请刷新目录核对。" });
          setMessage("队列已暂停，请核对逐项结果。"); break;
        }
      }
    } finally { running.current = false; setBusy(false); onRefresh(); }
  }
  const pending = items.filter(row => row.state === "queued").length;
  const done = items.filter(row => ["success", "failed", "unknown"].includes(row.state)).length;
  return <Modal open title="批量上传微规范" rootClassName="haldur-file-modal" width={760} onCancel={() => { if (busy) { stop.current = true; setMessage("将在当前文件完成后停止，结果将保留。"); } else onClose(); }} footer={<Space wrap>
    <Button disabled={!busy} onClick={() => { stop.current = true; }}>停止后续上传</Button><Button disabled={busy} onClick={onClose}>关闭</Button>
    <Button type="primary" disabled={busy || !pending || !topic || !scopes.length} onClick={() => void run()}>{busy ? "上传中…" : `上传 ${pending} 个文件`}</Button>
  </Space>}>
    <div className="mb-4 grid gap-3">
      <Select aria-label="上传目标文件夹" placeholder="选择目标文件夹" disabled={busy || locked} value={topic} onChange={setTopic} options={topics.map(t => ({ value: t, label: markdownKnowledgeSpecTopics.find(v => v.value === t)?.label ?? t }))}/>
      <Select mode="multiple" aria-label="上传规范关联类目" placeholder="选择关联类目（必填）" disabled={busy || locked} value={scopes} onChange={setScopes} options={[...markdownKnowledgeRelatedScopes]}/>
    </div>
    <Upload.Dragger multiple accept=".md" disabled={busy} showUploadList={false} beforeUpload={file => {
      const valid = /\.md$/i.test(file.name) && file.size <= 2 * 1024 * 1024;
      setItems(rows => rows.some(row => row.file.uid === file.uid) ? rows : [...rows, { file, state: valid ? "queued" : "failed", message: valid ? undefined : "仅支持不超过 2 MiB 的 .md 文件，未发送请求。" }]);
      return false;
    }}><p>点击选择或拖入多个 Markdown 文件</p><p className="ant-upload-hint">以文件名作为标题；同名规范不会覆盖。正文按原文导入。</p></Upload.Dragger>
    {message ? <Alert className="mt-4" type="warning" title={message} showIcon/> : null}
    {items.length ? <><Progress percent={Math.round(done / items.length * 100)} format={() => `${done} / ${items.length} 项已处理`}/><div className="haldur-upload-results" aria-label="逐项上传结果">{items.map(row => <div className="haldur-upload-row" key={row.file.uid}>
      <div><div className="haldur-upload-row-name">{row.file.name} <Tag color={row.state === "success" ? "success" : row.state === "failed" ? "error" : "default"}>{labels[row.state]}</Tag></div><div className="haldur-upload-row-message">{row.message ?? "待提交"}</div></div>
      {row.state === "queued" ? <Button size="small" disabled={busy} onClick={() => setItems(rows => rows.filter(item => item.file.uid !== row.file.uid))}>移除</Button> : null}
    </div>)}</div></> : null}
  </Modal>;
}
