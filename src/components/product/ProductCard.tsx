import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/types/product";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="library-row">
      <div className="grid md:grid-cols-[8.5rem_minmax(0,1fr)_13rem]">
        <div className="flex items-center justify-between border-b border-border bg-[hsl(var(--surface-subtle)/0.62)] p-5 md:block md:border-b-0 md:border-r md:p-6">
          <p className="section-kicker">Product</p>
          <p className="font-mono text-3xl font-black md:mt-14">VP</p>
        </div>
        <div className="p-5 md:p-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Updated {product.updatedAt.slice(0, 10)}</p>
          <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.02em]">{product.name}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">{product.description}</p>
          {product.tags?.length ? <p className="mt-4 font-mono text-[11px] text-muted-foreground">{product.tags.slice(0, 4).map((tag) => `#${tag}`).join("  ")}</p> : null}
        </div>
        <div className="flex items-center border-t border-border p-5 md:border-l md:border-t-0 md:p-6">
          <Button asChild variant="secondary" className="w-full">
            <a href={product.link} target="_blank" rel="noreferrer">打开产品 <ArrowUpRight size={16} /></a>
          </Button>
        </div>
      </div>
    </article>
  );
}
