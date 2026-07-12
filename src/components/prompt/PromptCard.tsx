"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PromptCopyButton } from "@/components/prompt/PromptCopyButton";
import type { PromptAsset } from "@/types/prompt";

export function PromptCard({ prompt, expanded, onToggle }: { prompt: PromptAsset; expanded: boolean; onToggle: () => void }) {
  const [copyCount, setCopyCount] = useState(prompt.copyCount);
  const increaseCopyCount = () => setCopyCount((value) => value + 1);

  return (
    <article className="border-b border-foreground/[0.08] py-9 transition-colors hover:bg-white/65 md:-mx-6 md:px-6">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {prompt.updatedAt.slice(0, 10)} · {prompt.category}</p>
          <Link href={`/prompts/${prompt.id}`}>
            <h2 className="mt-4 text-2xl font-black leading-tight transition hover:text-muted-foreground">{prompt.name}</h2>
          </Link>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{prompt.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {prompt.models.map((model) => <Badge key={model}>{model}</Badge>)}
            {prompt.scenarios.slice(0, 3).map((scene) => <Badge key={scene}>{scene}</Badge>)}
            {prompt.tags.slice(0, 3).map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
        </div>
        <div className="flex flex-col gap-4 md:items-end">
          <div className="font-mono text-xs text-muted-foreground md:text-right">
            <p>{"★".repeat(Math.max(1, Math.min(5, prompt.rating)))}</p>
            <p className="mt-2">{copyCount} copies</p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Button type="button" variant="outline" onClick={onToggle} aria-expanded={expanded}>
              {expanded ? "收起预览" : "预览"}
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </Button>
            <PromptCopyButton promptId={prompt.id} content={prompt.content} onCopied={increaseCopyCount} />
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="mt-8 border-t border-foreground/[0.1] bg-foreground/[0.025] p-5 md:p-7">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Prompt Content</p>
              <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap border border-foreground/[0.1] bg-white p-5 text-sm leading-7">{prompt.content}</pre>
            </div>
            <aside className="space-y-6 text-sm leading-7">
              <div>
                <h3 className="font-black">使用说明</h3>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{prompt.usageGuide || "暂无使用说明。"}</p>
              </div>
              <div>
                <h3 className="font-black">示例输入</h3>
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap bg-white p-3 text-xs">{prompt.exampleInput || "暂无示例输入。"}</pre>
              </div>
              <div>
                <h3 className="font-black">示例输出</h3>
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap bg-white p-3 text-xs">{prompt.exampleOutput || "暂无示例输出。"}</pre>
              </div>
              <div className="flex flex-wrap gap-3">
                <PromptCopyButton promptId={prompt.id} content={prompt.content} onCopied={increaseCopyCount} />
                <Button asChild variant="outline">
                  <Link href={`/prompts/${prompt.id}`}>
                    完整详情 <ArrowUpRight size={16} />
                  </Link>
                </Button>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </article>
  );
}
