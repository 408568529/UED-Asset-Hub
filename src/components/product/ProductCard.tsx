import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Product } from "@/types/product";

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="border-t border-foreground/10 py-8">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <p className="font-mono text-xs text-muted-foreground">Updated {product.updatedAt.slice(0, 10)}</p>
          <h2 className="mt-4 text-3xl font-black leading-tight md:text-4xl">{product.name}</h2>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{product.description}</p>
        </div>
        <Button asChild variant="secondary">
          <a href={product.link} target="_blank" rel="noreferrer">
            打开产品
            <ArrowUpRight size={16} />
          </a>
        </Button>
      </div>
    </article>
  );
}
