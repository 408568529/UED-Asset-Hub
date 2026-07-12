import { PromptList } from "@/components/prompt/PromptList";
import { ModulePageHeader } from "@/components/layout/ModulePageHeader";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { promptService } from "@/services/promptService";

export default async function PromptsPage({ searchParams }: { searchParams: Promise<{ q?: string; model?: string }> }) {
  const { q, model } = await searchParams;
  const prompts = (await promptService.getPrompts(q)).filter((prompt) => !model || model === "全部" || prompt.models.includes(model as never));
  const hotPrompts = prompts.slice(0, 3);

  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <ModulePageHeader eyebrow="Prompt Library" title="团队 Prompt 资源中心" description="沉淀 ChatGPT、Claude、Codex、Cursor 等 AI Prompt，让高质量提示词被搜索、复制和复用。" count={prompts.length}>
        <form action="/prompts" className="space-y-3">
          <Input name="q" defaultValue={q} placeholder="搜索 Prompt 标题、内容或标签" controlSize="lg" />
          <Select name="model" defaultValue={model ?? "全部"} controlSize="lg">
            {["全部", "ChatGPT", "Codex", "Claude", "Cursor", "Gemini", "DeepSeek"].map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </form>
      </ModulePageHeader>

      {hotPrompts.length ? (
        <section className="mt-16 bg-foreground px-6 py-10 text-white md:mt-20 md:p-12">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-white/45">Featured Prompt</p>
          <h2 className="mt-5 max-w-3xl text-2xl font-black leading-tight md:text-3xl">本周热门 Prompt</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {hotPrompts.map((prompt, index) => (
              <a key={prompt.id} href={`/prompts/${prompt.id}`} className="block bg-white/[0.06] p-6 transition hover:-translate-y-1 hover:bg-primary hover:text-foreground">
                <p className="font-mono text-xs opacity-55">0{index + 1}</p>
                <h3 className="mt-8 text-2xl font-black leading-tight">{prompt.name}</h3>
                <p className="mt-4 text-sm opacity-70">{prompt.copyCount} copies</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-16 md:mt-20">
        <div className="mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">All Prompts</p>
          <h2 className="mt-4 text-2xl font-black md:text-3xl">全部 Prompt</h2>
        </div>
        <PromptList prompts={prompts} />
        {!prompts.length ? <p className="py-8 text-muted-foreground">暂无 Prompt 资产。</p> : null}
      </section>
    </main>
  );
}
