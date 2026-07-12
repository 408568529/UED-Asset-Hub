import { ArrowUpRight, Figma } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ComponentSpec } from "@/types/componentSpec";

export function ComponentSpecCard({ component }: { component: ComponentSpec }) {
  return (
    <article className="border-b border-foreground/[0.08] py-9 transition-colors hover:bg-white/65 md:-mx-6 md:px-6">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {component.updatedAt.slice(0, 10)}</p>
          <h2 className="mt-4 text-2xl font-black leading-tight">{component.name}</h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{component.description}</p>
        </div>
        <div className="flex flex-wrap gap-3 md:justify-end">
          {component.figmaLink ? (
            <Button asChild variant="outline">
              <a href={component.figmaLink} target="_blank" rel="noreferrer">
                <Figma size={16} />
                Figma
              </a>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
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
