import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Sop } from "@/types/sop";

export function SopCard({ sop }: { sop: Sop }) {
  return (
    <article className="library-row">
      <div className="grid md:grid-cols-[8.5rem_minmax(0,1fr)_13rem]">
        <div className="flex items-center justify-between border-b border-border bg-[hsl(var(--surface-subtle)/0.62)] p-5 md:block md:border-b-0 md:border-r md:p-6">
          <p className="section-kicker">Process</p>
          <p className="font-mono text-3xl font-black md:mt-14">SOP</p>
        </div>
        <div className="p-5 md:p-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Updated {sop.updatedAt.slice(0, 10)} {sop.owner ? `· ${sop.owner}` : ""}</p>
          <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.02em]">{sop.name}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">{sop.description}</p>
        </div>
        <div className="flex items-center border-t border-border p-5 md:border-l md:border-t-0 md:p-6">
          <Button asChild variant="secondary" className="w-full">
            <a href={sop.docLink} target="_blank" rel="noreferrer">查看 SOP <ArrowUpRight size={16} /></a>
          </Button>
        </div>
      </div>
    </article>
  );
}
