import { ArrowUpRight, Figma } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComponentSpec } from "@/types/componentSpec";

export function ComponentSpecCard({ component }: { component: ComponentSpec }) {
  return (
    <article className="library-row">
      <div className="grid md:grid-cols-[8.5rem_minmax(0,1fr)_17rem]">
        <div className="flex items-center justify-between border-b border-border bg-[hsl(var(--surface-subtle)/0.62)] p-5 md:block md:border-b-0 md:border-r md:p-6">
          <p className="section-kicker">Spec</p>
          <p className="font-mono text-3xl font-black md:mt-14">CS</p>
        </div>
        <div className="p-5 md:p-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Updated {component.updatedAt.slice(0, 10)}</p>
          <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.02em]">{component.name}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">{component.description}</p>
        </div>
        <div className="flex flex-wrap content-center gap-2 border-t border-border p-5 md:border-l md:border-t-0 md:p-6">
          {component.figmaLink ? (
            <Button asChild variant="outline">
              <a href={component.figmaLink} target="_blank" rel="noreferrer">
                <Figma size={16} />
                Figma
              </a>
            </Button>
          ) : null}
          <Button asChild variant="secondary" className="flex-1">
            <a href={component.docLink} target="_blank" rel="noreferrer">
              查看规范
              <ArrowUpRight size={16} />
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}
