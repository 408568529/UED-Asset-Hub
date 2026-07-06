import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Sop } from "@/types/sop";

export function SopCard({ sop }: { sop: Sop }) {
  return (
    <article className="border-t border-foreground/10 py-8">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {sop.updatedAt.slice(0, 10)} {sop.owner ? `· ${sop.owner}` : ""}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight md:text-4xl">{sop.name}</h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{sop.description}</p>
        </div>
        <Button asChild variant="secondary">
          <a href={sop.docLink} target="_blank" rel="noreferrer">
            查看 SOP
            <ArrowUpRight size={16} />
          </a>
        </Button>
      </div>
    </article>
  );
}
