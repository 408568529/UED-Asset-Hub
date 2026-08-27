import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, Pencil, Play } from "lucide-react";
import { MarkdownKnowledgeDetail } from "@/components/knowledge/MarkdownKnowledgeDetail";
import { FontPreview } from "@/components/font/FontPreview";
import { PromptCopyButton } from "@/components/prompt/PromptCopyButton";
import { TrainingPlayer } from "@/components/training/TrainingPlayer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FontAsset } from "@/types/font";
import type { KnowledgeAssetView } from "@/types/knowledge";
import type { PromptAsset } from "@/types/prompt";
import type { Skill } from "@/types/skill";
import type { FontVersion } from "@/types/font";
import type { SkillVersion } from "@/types/skill";
import type { TrainingVideo } from "@/types/training";
import type { MarkdownKnowledgeDocument } from "@/types/markdownKnowledge";
import { markdownKnowledgeRelatedScopes, markdownKnowledgeSpecTopics } from "@/types/markdownKnowledge";
import { appendKnowledgeReturnHref } from "@/lib/knowledgeNavigation";

export type KnowledgeWorkspaceDetailData =
  | { asset: KnowledgeAssetView; kind: "markdown"; item: MarkdownKnowledgeDocument }
  | { asset: KnowledgeAssetView; kind: "prompt"; item: PromptAsset }
  | { asset: KnowledgeAssetView; kind: "skill"; item: Skill; versions: SkillVersion[] }
  | { asset: KnowledgeAssetView; kind: "font"; item: FontAsset; versions: FontVersion[] }
  | { asset: KnowledgeAssetView; kind: "training"; item: TrainingVideo };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function DetailMetadata({ asset, markdown }: { asset: KnowledgeAssetView; markdown?: MarkdownKnowledgeDocument }) {
  const microSpec = markdown?.metadata.documentType === "micro-spec" ? markdown.metadata : null;
  return (
    <aside className="border-t border-border px-4 py-5 xl:border-l xl:border-t-0 xl:px-6" aria-label="资产元数据">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Metadata</p>
      <dl className="mt-4 grid gap-4 text-sm">
        <div><dt className="text-xs text-muted-foreground">类型</dt><dd className="mt-1 font-bold">{asset.assetTypeLabel}</dd></div>
        <div><dt className="text-xs text-muted-foreground">分类</dt><dd className="mt-1 font-bold">{asset.businessCategory || "未分类"}</dd></div>
        {microSpec ? <div><dt className="text-xs text-muted-foreground">规范主题</dt><dd className="mt-1 font-bold">{markdownKnowledgeSpecTopics.find((option) => option.value === microSpec.specTopic)?.label ?? microSpec.specTopic}</dd></div> : null}
        {microSpec ? <div><dt className="text-xs text-muted-foreground">关联类目</dt><dd className="mt-2 flex flex-wrap gap-1.5">{microSpec.relatedScopes.map((scope) => <Badge key={scope}>{markdownKnowledgeRelatedScopes.find((option) => option.value === scope)?.label ?? scope}</Badge>)}</dd></div> : null}
        <div><dt className="text-xs text-muted-foreground">作者 / 来源</dt><dd className="mt-1 font-bold">{asset.owner || "未填写"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">更新时间</dt><dd className="mt-1 font-bold tabular-nums">{formatDate(asset.updatedAt)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">标签</dt><dd className="mt-2 flex flex-wrap gap-1.5">{asset.tags.length ? asset.tags.map((tag) => <Badge key={tag}>#{tag}</Badge>) : <span className="text-muted-foreground">—</span>}</dd></div>
      </dl>
    </aside>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b border-border px-4 py-5 md:px-6"><h2 className="text-sm font-black">{title}</h2><div className="mt-3 text-sm leading-7 text-muted-foreground">{children}</div></section>;
}

export function KnowledgeWorkspaceDetail({ detail, backHref }: { detail: KnowledgeWorkspaceDetailData; backHref: string }) {
  const { asset } = detail;
  const action = detail.kind === "prompt"
    ? <PromptCopyButton promptId={detail.item.id} content={detail.item.content} />
    : detail.kind === "skill"
      ? <Button asChild size="sm"><a href={`/api/skills/${detail.item.id}/download`}><Download size={15} />下载 Skill</a></Button>
      : detail.kind === "font"
        ? <Button asChild size="sm"><a href={`/api/fonts/${detail.item.id}/download`}><Download size={15} />下载字体</a></Button>
        : detail.kind === "markdown"
          ? <Button asChild size="sm"><Link href={appendKnowledgeReturnHref(`/admin/knowledge/${encodeURIComponent(detail.item.metadata.id)}/edit`, backHref)}><Pencil size={15} />编辑 Markdown</Link></Button>
          : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label={`${asset.title} 详情`}>
      <header className="border-b border-border px-4 py-4 md:px-6">
        <Link href={backHref} className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-muted-foreground transition hover:text-foreground"><ArrowLeft size={16} />返回列表</Link>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Badge>{asset.assetTypeLabel}</Badge><span className="text-xs text-muted-foreground">{asset.businessCategory || "未分类"}</span></div>
            <h1 className="mt-3 text-xl font-black tracking-[-0.025em] md:text-2xl">{asset.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{asset.description || "暂无描述"}</p>
          </div>
          <div className="shrink-0">{action}</div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <article className="min-w-0">
          {detail.kind === "prompt" ? <>
            <DetailSection title="Prompt 正文"><pre className="whitespace-pre-wrap bg-[hsl(var(--surface-subtle)/0.55)] p-4 font-sans text-sm leading-7 text-foreground">{detail.item.content || "暂无 Prompt 内容。"}</pre></DetailSection>
            <DetailSection title="使用说明">{detail.item.usageGuide || "暂无使用说明。"}</DetailSection>
            {(detail.item.exampleInput || detail.item.exampleOutput) ? <div className="grid md:grid-cols-2"><DetailSection title="示例输入"><pre className="whitespace-pre-wrap">{detail.item.exampleInput || "—"}</pre></DetailSection><DetailSection title="示例输出"><pre className="whitespace-pre-wrap">{detail.item.exampleOutput || "—"}</pre></DetailSection></div> : null}
          </> : null}
          {detail.kind === "markdown" ? <MarkdownKnowledgeDetail content={detail.item.content} /> : null}
          {detail.kind === "skill" ? <>
            <DetailSection title="README"><pre className="whitespace-pre-wrap bg-[hsl(var(--surface-subtle)/0.55)] p-4 font-sans text-sm leading-7 text-foreground">{detail.item.readme || "暂无 README。"}</pre></DetailSection>
            <DetailSection title="使用场景">{detail.item.usageScenarios.length ? <div className="flex flex-wrap gap-2">{detail.item.usageScenarios.map((scenario) => <Badge key={scenario}>{scenario}</Badge>)}</div> : "未填写使用场景。"}</DetailSection>
            <DetailSection title="更新说明">{detail.item.changeLog || "暂无更新说明。"}</DetailSection>
            <DetailSection title="版本记录">{detail.versions.length ? <div className="divide-y divide-border">{detail.versions.map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"><div><p className="font-bold text-foreground">{version.version}</p><p className="mt-1 text-xs">{version.fileName} · {version.changeLog || "暂无说明"}</p></div><a href={`/api/skills/${detail.item.id}/download?versionId=${version.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-foreground underline">下载 <Download size={14} /></a></div>)}</div> : "暂无历史版本。"}</DetailSection>
          </> : null}
          {detail.kind === "font" ? <>
            <FontPreview font={detail.item} variant="workspace" />
            <DetailSection title="授权说明">{detail.item.license || "未填写授权说明。"}</DetailSection>
            <DetailSection title="版本记录">{detail.versions.length ? <div className="divide-y divide-border">{detail.versions.map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0"><div><p className="font-bold text-foreground">{version.version}</p><p className="mt-1 text-xs">{version.fileName}</p></div><a href={`/api/fonts/${detail.item.id}/download?versionId=${version.id}`} className="inline-flex items-center gap-1 text-sm font-bold text-foreground underline">下载 <Download size={14} /></a></div>)}</div> : "暂无历史版本。"}</DetailSection>
            {detail.item.officialUrl ? <DetailSection title="官方链接"><a href={detail.item.officialUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-foreground underline">字体官网 <ExternalLink size={14} /></a></DetailSection> : null}
          </> : null}
          {detail.kind === "training" ? <>
            <section className="border-b border-border px-4 py-5 md:px-6"><div className="mb-3 flex items-center gap-2 text-sm font-black"><Play size={16} />视频播放</div><TrainingPlayer videoId={detail.item.id} title={detail.item.title} poster={detail.item.coverPath ? `/api/training/videos/${detail.item.id}/cover` : undefined} initialPlayCount={detail.item.playCount} /></section>
            <DetailSection title="视频说明">{detail.item.description || "暂无视频简介。"}</DetailSection>
          </> : null}
        </article>
        <DetailMetadata asset={asset} markdown={detail.kind === "markdown" ? detail.item : undefined} />
      </div>
    </div>
  );
}
