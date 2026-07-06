import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PromptCopyButton } from "@/components/prompt/PromptCopyButton";
import type { PromptAsset } from "@/types/prompt";

export function PromptCard({ prompt }: { prompt: PromptAsset }) {
  return (
    <article className="border-b border-foreground/[0.08] py-10 transition hover:bg-white/55 md:-mx-6 md:px-6">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {prompt.updatedAt.slice(0, 10)} · {prompt.category}</p>
          <Link href={`/prompts/${prompt.id}`}>
            <h2 className="mt-4 text-2xl font-black leading-tight transition hover:text-muted-foreground">{prompt.name}</h2>
          </Link>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{prompt.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {prompt.models.map((model) => <Badge key={model}>{model}</Badge>)}
            {prompt.scenarios.slice(0, 3).map((scene) => <Badge key={scene}>{scene}</Badge>)}
          </div>
        </div>
        <div className="flex flex-col gap-4 md:items-end md:pt-8">
          <div className="font-mono text-xs text-muted-foreground md:text-right">
            <p>{"★".repeat(Math.max(1, Math.min(5, prompt.rating)))}</p>
            <p className="mt-2">{prompt.copyCount} copies</p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Button asChild variant="outline">
              <Link href={`/prompts/${prompt.id}`}>
                查看详情
                <ArrowUpRight size={16} />
              </Link>
            </Button>
            <PromptCopyButton promptId={prompt.id} content={prompt.content} />
          </div>
        </div>
      </div>
    </article>
  );
}
