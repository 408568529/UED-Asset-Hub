import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Sop } from "@/types/sop";

export function SopCard({ sop }: { sop: Sop }) {
  return (
    <article className="border-b border-foreground/[0.08] py-9 transition-colors hover:bg-white/65 md:-mx-6 md:px-6">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {sop.updatedAt.slice(0, 10)} {sop.owner ? `· ${sop.owner}` : ""}</p>
          <h2 className="mt-4 text-2xl font-black leading-tight">{sop.name}</h2>
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
