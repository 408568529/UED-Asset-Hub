import { notFound } from "next/navigation";
import { AssetDetailHeader } from "@/components/layout/AssetDetailHeader";
import { Badge } from "@/components/ui/badge";
import { PromptCopyButton } from "@/components/prompt/PromptCopyButton";
import { promptService } from "@/services/promptService";

export default async function PromptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prompt = await promptService.incrementView(decodeURIComponent(id));
  if (!prompt) notFound();
  const related = (await promptService.getPrompts()).filter((item) => item.id !== prompt.id).slice(0, 3);

  return (
    <main className="page-shell page-frame">
      <AssetDetailHeader
        eyebrow="Prompt Library"
        marker="/>"
        title={prompt.name}
        description={prompt.summary}
        meta={<><p>Author · <strong className="text-foreground">{prompt.author}</strong></p><p>Version · {prompt.version}</p><p>Difficulty · {prompt.difficulty}</p><p>{prompt.copyCount} copies</p></>}
        tags={<><Badge>{prompt.category}</Badge><Badge>{prompt.difficulty}</Badge><Badge className="border-amber-300 bg-amber-50 text-amber-700">{"★".repeat(Math.max(1, Math.min(5, prompt.rating)))}</Badge>{prompt.models.map((model) => <Badge key={model}>{model}</Badge>)}{prompt.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</>}
        actions={<PromptCopyButton promptId={prompt.id} content={prompt.content} />}
      />
      <section className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-14">
          <section className="detail-surface p-6 md:p-8">
            <p className="section-kicker">Prompt content</p>
            <h2 className="mt-3 text-2xl font-black">Prompt 正文</h2>
            <pre className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{prompt.content}</pre>
          </section>
          <section className="detail-surface p-6 md:p-8">
            <h2 className="text-2xl font-black">使用说明</h2>
            <pre className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{prompt.usageGuide || "暂无使用说明。"}</pre>
          </section>
          <section className="detail-surface p-6 md:p-8">
            <h2 className="text-2xl font-black">示例输入</h2>
            <pre className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{prompt.exampleInput || "暂无示例输入。"}</pre>
          </section>
          <section className="detail-surface p-6 md:p-8">
            <h2 className="text-2xl font-black">示例输出</h2>
            <pre className="mt-6 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{prompt.exampleOutput || "暂无示例输出。"}</pre>
          </section>
        </div>
        <aside className="detail-surface p-6 md:p-7">
          <p className="section-kicker">Metadata</p>
          <h2 className="mt-3 text-2xl font-black">资产信息</h2>
          <dl className="mt-5 space-y-4 text-sm leading-6">
            <div><dt className="font-bold">作者</dt><dd className="text-muted-foreground">{prompt.author}</dd></div>
            <div><dt className="font-bold">版本</dt><dd className="text-muted-foreground">{prompt.version}</dd></div>
            <div><dt className="font-bold">输出类型</dt><dd className="text-muted-foreground">{prompt.outputTypes.join(", ")}</dd></div>
            <div><dt className="font-bold">使用场景</dt><dd className="text-muted-foreground">{prompt.scenarios.join(", ")}</dd></div>
            <div><dt className="font-bold">复制次数</dt><dd className="text-muted-foreground">{prompt.copyCount}</dd></div>
          </dl>
          <h2 className="mt-10 text-2xl font-black">相关推荐</h2>
          <div className="mt-5">
            {related.map((item) => <a key={item.id} href={`/prompts/${item.id}`} className="block border-b border-foreground/[0.08] py-4 text-sm font-bold transition hover:text-muted-foreground">{item.name}</a>)}
          </div>
        </aside>
      </section>
    </main>
  );
}
