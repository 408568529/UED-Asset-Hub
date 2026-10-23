"use client";

import { FileUp, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LabeledField } from "@/components/admin/LabeledField";
import { Button, Input, Select, Segmented } from "antd";
import { Input as FileInput } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { normalizeLegacyEscapedMarkdown } from "@/lib/markdown";
import { markdownKnowledgeRelatedScopes, markdownKnowledgeSpecTopics, type MarkdownKnowledgeDocument, type MarkdownKnowledgeDocumentType, type MarkdownKnowledgeRelatedScope, type MarkdownKnowledgeSpecTopic } from "@/types/markdownKnowledge";

function parseTags(value: string) {
  const unique = new Map<string, string>();
  value.split(/[,，]/).forEach((tag) => {
    const trimmed = tag.trim().replace(/\s+/g, " ");
    const key = trimmed.toLocaleLowerCase();
    if (key && !unique.has(key)) unique.set(key, trimmed);
  });
  return [...unique.values()];
}

function fileNameTitle(fileName: string) {
  return fileName.replace(/\.md$/i, "");
}

export function MarkdownKnowledgeForm({ documentType, document, returnHref = "/knowledge" }: { documentType: MarkdownKnowledgeDocumentType; document?: MarkdownKnowledgeDocument; returnHref?: string }) {
  const router = useRouter();
  const isEdit = Boolean(document);
  const isMicroSpec = documentType === "micro-spec";
  const metadata = document?.metadata;
  const [mode, setMode] = useState<"online" | "upload">("online");
  const [title, setTitle] = useState(metadata?.title ?? "");
  const [description, setDescription] = useState(metadata?.description ?? "");
  const [category, setCategory] = useState(metadata?.category ?? "");
  const [tags, setTags] = useState(metadata?.tags.join(", ") ?? "");
  const [content, setContent] = useState(() => normalizeLegacyEscapedMarkdown(document?.content ?? ""));
  const [specTopic, setSpecTopic] = useState<MarkdownKnowledgeSpecTopic | "">(metadata?.documentType === "micro-spec" ? metadata.specTopic : "");
  const [relatedScopes, setRelatedScopes] = useState<MarkdownKnowledgeRelatedScope[]>(metadata?.documentType === "micro-spec" ? metadata.relatedScopes : []);
  const [sourceFileName, setSourceFileName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [topicOptions, setTopicOptions] = useState<Array<{value: string; label: string}>>([]);
  const [revision, setRevision] = useState<number>();
  useEffect(() => {
    if (!isMicroSpec) return;
    fetch("/api/micro-standards").then(async r => { const value = await r.json(); if (!r.ok) throw Error(value.message); setTopicOptions(value.topics.map((t: string) => ({ value: t, label: markdownKnowledgeSpecTopics.find(o => o.value === t)?.label ?? t }))); setRevision(value.revision); }).catch(e => setMessage(e.message));
  }, [isMicroSpec]);

  async function selectMarkdownFile(file?: File) {
    if (!file) return;
    if (!/\.md$/i.test(file.name)) {
      setMessage("仅支持上传 .md 文件。");
      return;
    }
    try {
      const markdown = await file.text();
      setSourceFileName(file.name);
      setTitle(fileNameTitle(file.name));
      setContent(markdown);
      setMessage("");
    } catch {
      setMessage("Markdown 文件读取失败，请重新选择。");
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (!title.trim()) {
      setMessage(isMicroSpec ? "请输入规则名称。" : "请输入文档标题。");
      return;
    }
    if (!content.trim()) {
      setMessage("请输入 Markdown 正文。");
      return;
    }
    if (isMicroSpec && !specTopic) {
      setMessage("请选择规范主题。");
      return;
    }
    if (isMicroSpec && !relatedScopes.length) {
      setMessage("请至少选择一个关联类目。");
      return;
    }
    if (mode === "upload" && !isEdit && !sourceFileName) {
      setMessage("请先选择 .md 文件。");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(isMicroSpec ? (isEdit ? `/api/micro-standards/${encodeURIComponent(metadata?.id ?? "")}` : "/api/micro-standards") : (isEdit ? `/api/knowledge/${encodeURIComponent(metadata?.id ?? "")}` : "/api/knowledge"), {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          revision,
          documentType,
          description,
          category,
          tags: parseTags(tags),
          content,
          specTopic: isMicroSpec ? specTopic : undefined,
          relatedScopes: isMicroSpec ? relatedScopes : undefined,
          sourceFileName: !isEdit && mode === "upload" ? sourceFileName : undefined
        })
      });
      const result = await response.json() as MarkdownKnowledgeDocument | { message?: string };
      if (!response.ok || !("metadata" in result)) {
        setMessage("message" in result && result.message ? result.message : "保存失败，请稍后重试。");
        return;
      }
      const detailHref = new URL(returnHref, window.location.origin);
      detailHref.searchParams.set("asset", isMicroSpec ? result.metadata.id : `${result.metadata.documentType}:${result.metadata.id}`);
      router.push(`${detailHref.pathname}${detailHref.search}`);
      router.refresh();
    } catch {
      setMessage("保存失败，请检查网络或 DATA_DIR 权限。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="workflow-form space-y-6">
      {isMicroSpec && !isEdit ? (
        <div>
          <p className="text-[13px] font-bold">创建方式</p>
          <Segmented value={mode} onChange={(value) => setMode(value as "online" | "upload")} aria-label="微规范创建方式" className="knowledge-mode mt-2" options={[
            { value: "online", label: <><PenLine size={16} />在线创建</> },
            { value: "upload", label: <><FileUp size={16} />上传 Markdown</> }
          ]} />
        </div>
      ) : null}

      {isMicroSpec && !isEdit && mode === "upload" ? (
        <LabeledField label="Markdown 文件" required hint="选择文件只会填充当前草稿；点击创建前不会写入 DATA_DIR。">
          <FileInput type="file" accept=".md,text/markdown" onChange={(event) => void selectMarkdownFile(event.target.files?.[0])} />
        </LabeledField>
      ) : null}

      <LabeledField label={isMicroSpec ? "规则名称" : "标题"} required>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder={isMicroSpec ? "请输入规则名称" : "请输入文档标题"} />
      </LabeledField>

      {isMicroSpec ? (
        <div className="grid gap-[var(--field-column-gap)] md:grid-cols-2">
          <LabeledField label="规范主题" required>
            <Select id="knowledge-spec-topic" value={specTopic || undefined} onChange={(value: MarkdownKnowledgeSpecTopic) => setSpecTopic(value)} placeholder="请选择规范主题" aria-label="规范主题" aria-required="true" className="w-full" status={message === "请选择规范主题。" ? "error" : undefined} options={topicOptions} />
            {/* Preserve the native required constraint supplied by the previous Radix select. */}
            <select required value={specTopic} onChange={(event) => setSpecTopic(event.target.value as MarkdownKnowledgeSpecTopic)} tabIndex={-1} aria-hidden="true" className="sr-only" onInvalid={(event) => { event.preventDefault(); setMessage("请选择规范主题。"); window.document.getElementById("knowledge-spec-topic")?.focus(); }}>
              <option value="" />
              {topicOptions.map((topic) => <option key={topic.value} value={topic.value}>{topic.label}</option>)}
            </select>
          </LabeledField>
          <LabeledField label="关联类目" required>
            <Select mode="multiple" showSearch={{ optionFilterProp: "label" }} className="w-full" aria-label="关联类目" aria-required="true"
              options={markdownKnowledgeRelatedScopes.map((scope) => ({ value: scope.value, label: scope.label }))}
              value={relatedScopes}
              onChange={(value: MarkdownKnowledgeRelatedScope[]) => setRelatedScopes(value)}
              status={message === "请至少选择一个关联类目。" ? "error" : undefined}
              placeholder="请选择关联类目"
            />
          </LabeledField>
        </div>
      ) : null}

      <LabeledField label="简介">
        <Input.TextArea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder={isMicroSpec ? "简要说明规则解决的问题" : "简要介绍文档内容"} />
      </LabeledField>

      <div className="grid gap-[var(--field-column-gap)] md:grid-cols-2">
        <LabeledField label="分类"><Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="请输入分类" /></LabeledField>
        <LabeledField label="标签" hint="多个标签请使用逗号分隔"><Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="例如：Portal, 表格" /></LabeledField>
      </div>

      <div className="grid gap-[var(--field-label-gap)]">
        <span className="text-[13px] font-bold leading-5 text-foreground">Markdown 正文<span className="ml-1 text-destructive">*</span></span>
        <MarkdownEditor markdown={content} onChange={setContent} />
        <span className="text-[13px] leading-5 text-muted-foreground">支持标准 Markdown 与 GFM 表格；详情页默认显示渲染视图。</span>
      </div>

      <div className="knowledge-form-actions flex flex-wrap gap-3">
        <Button type="primary" htmlType="submit" loading={saving} disabled={saving}>{saving ? "保存中…" : isEdit ? "保存修改" : isMicroSpec ? "创建微规范" : "创建文档"}</Button>
        <Button htmlType="button" disabled={saving} onClick={() => router.push(returnHref)}>取消</Button>
      </div>
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
    </form>
  );
}
