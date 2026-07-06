import { PromptCard } from "@/components/prompt/PromptCard";
import { Input } from "@/components/ui/input";
import { promptService } from "@/services/promptService";

export default async function PromptsPage({ searchParams }: { searchParams: Promise<{ q?: string; model?: string }> }) {
  const { q, model } = await searchParams;
  const prompts = (await promptService.getPrompts(q)).filter((prompt) => !model || model === "全部" || prompt.models.includes(model as never));
  const hotPrompts = prompts.slice(0, 3);

  return (
    <main className="mx-auto max-w-7xl px-5 py-20 md:py-28">
      <div className="grid gap-8 md:grid-cols-[1fr_360px] md:items-end">
        <div>
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-muted-foreground">Prompt Library</p>
          <h1 className="mt-6 max-w-5xl text-2xl font-black leading-tight md:text-3xl">团队 Prompt 资源中心</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">沉淀 ChatGPT、Claude、Codex、Cursor 等 AI Prompt，让高质量提示词被搜索、复制和复用。</p>
        </div>
        <form action="/prompts" className="space-y-3">
          <div className="bg-white p-1 shadow-[0_18px_60px_rgba(0,0,0,0.05)]">
            <Input name="q" defaultValue={q} placeholder="搜索 Prompt 标题、内容或标签" className="border-0 bg-transparent focus:ring-0" />
          </div>
          <select name="model" defaultValue={model ?? "全部"} className="h-12 w-full border border-foreground/[0.08] bg-white px-4 text-sm outline-none focus:border-foreground/25">
            {["全部", "ChatGPT", "Codex", "Claude", "Cursor", "Gemini", "DeepSeek"].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </form>
      </div>

      {hotPrompts.length ? (
        <section className="mt-24 bg-foreground px-6 py-10 text-white md:p-12">
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

      <section className="mt-24">
        <div className="mb-10">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">All Prompts</p>
          <h2 className="mt-4 text-2xl font-black md:text-3xl">全部 Prompt</h2>
        </div>
        {prompts.map((prompt) => <PromptCard key={prompt.id} prompt={prompt} />)}
        {!prompts.length ? <p className="py-8 text-muted-foreground">暂无 Prompt 资产。</p> : null}
      </section>
    </main>
  );
}
