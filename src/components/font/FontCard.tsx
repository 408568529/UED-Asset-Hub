import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FontAsset } from "@/types/font";

export function FontCard({ font }: { font: FontAsset }) {
  return (
    <article className="border-b border-foreground/[0.08] py-9 transition-colors hover:bg-white/65 md:-mx-6 md:px-6">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {font.updatedAt.slice(0, 10)} · {font.category}</p>
          <Link href={`/fonts/${font.id}`}>
            <h2 className="mt-4 text-2xl font-black leading-tight transition hover:text-muted-foreground">{font.name}</h2>
          </Link>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{font.description}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Badge>{font.fileFormat}</Badge>
            <Badge>{font.version}</Badge>
            {font.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}
          </div>
        </div>
        <div className="flex flex-col gap-4 md:items-end">
          <p className="font-mono text-xs text-muted-foreground md:text-right">{font.downloadCount} downloads</p>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Button asChild variant="outline">
              <Link href={`/fonts/${font.id}`}>
                查看字体
                <ArrowUpRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <a href={`/api/fonts/${font.id}/download`}>
                下载字体
                <ArrowDownToLine size={16} />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
