"use client";
import { Button, Modal, Space, Typography } from "antd";
import { KnowledgeThemeProvider } from "@/components/knowledge/KnowledgeThemeProvider";
import "./haldur-file-tools.css";
export function HaldurFilePreviewModal({ path, onClose }: { path: string; onClose: () => void }) {
  const view = `/api/haldur-design-skill/preview/view?path=${encodeURIComponent(path)}`;
  return <KnowledgeThemeProvider><Modal open transitionName="" maskTransitionName="" title={<div className="haldur-preview-heading"><Typography.Text ellipsis={{ tooltip: path }}>{path.split("/").pop()}</Typography.Text><span>{path}</span></div>} rootClassName="haldur-file-modal haldur-preview-modal" width="min(1280px, calc(100vw - 32px))" footer={null} onCancel={onClose} destroyOnHidden focusable={{ trap: true, focusTriggerAfterClose: true }}>
    <Space className="haldur-preview-actions" wrap><Button href={view} target="_blank" rel="noopener noreferrer">新标签页打开</Button><Button href={`/api/haldur-design-skill/files?path=${encodeURIComponent(path)}`}>下载原文件</Button><Button onClick={onClose}>关闭预览</Button></Space>
    <iframe title={`${path} 安全查看器`} src={`${view}&embedded=1`} className="haldur-preview-host" />
  </Modal></KnowledgeThemeProvider>;
}
