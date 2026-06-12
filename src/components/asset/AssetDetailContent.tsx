import { Badge } from "@/components/ui/badge";
import type { Asset } from "@/types/asset";

export function AssetDetailContent({ asset }: { asset: Asset }) {
  const sections = asset.content
    .trim()
    .split("\n")
    .filter(Boolean);

  return (
    <article className="prose prose-slate max-w-none">
      <div className="mb-8 rounded-[1.5rem] border border-primary/15 bg-primary/5 p-5">
        <Badge className="border-primary/20 bg-white text-primary">AI总结</Badge>
        <p className="mt-3 text-base leading-7 text-foreground">{asset.aiSummary}</p>
      </div>
      <div className="space-y-5 text-[15px] leading-8 text-slate-700">
        {sections.map((line) => {
          if (line.startsWith("## ")) {
            return (
              <h2 key={line} className="pt-4 text-2xl font-bold text-foreground">
                {line.replace("## ", "")}
              </h2>
            );
          }
          if (line.startsWith("- ")) {
            return (
              <p key={line} className="rounded-2xl bg-muted/60 px-4 py-3">
                {line.replace("- ", "")}
              </p>
            );
          }
          return <p key={line}>{line}</p>;
        })}
      </div>
    </article>
  );
}
